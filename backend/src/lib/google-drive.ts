import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "./prisma.js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SHEET_EXPORT_SECRET = process.env.SHEET_EXPORT_SECRET;
// Same env var storage-local.ts's signed file URLs use — whatever base URL
// is actually reachable by a browser (localhost in dev, the Cloudflare
// tunnel or real deployment host otherwise).
const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;

const SIGNED_URL_TTL_SECONDS = 300; // matches the FILE storage adapters' TTL

// Every Google Workspace doc type this app knows how to render in-app,
// mapped to what to ask Drive's export endpoint for and which of our own
// existing in-app viewers (DocumentViewerModal.tsx) can render the result.
// Sheets -> .xlsx -> the spreadsheet viewer (SheetJS/ExcelJS, already built
// for uploaded xlsx files). Docs -> PDF -> the existing pdf.js viewer,
// deliberately NOT .docx — docx links already route to Google's own
// external viewer by design (see useDocumentViewer.tsx), and reusing the
// PDF viewer here means no new in-app renderer is needed at all.
const EXPORT_TARGETS = [
  {
    urlPattern: /^https:\/\/docs\.google\.com\/spreadsheets\//,
    exportMimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    kind: "spreadsheet" as const,
  },
  {
    urlPattern: /^https:\/\/docs\.google\.com\/document\//,
    exportMimeType: "application/pdf",
    kind: "pdf" as const,
  },
];

export type DriveExportKind = (typeof EXPORT_TARGETS)[number]["kind"];

export function getDriveExportTarget(url: string): { exportMimeType: string; kind: DriveExportKind } | null {
  const target = EXPORT_TARGETS.find((t) => t.urlPattern.test(url));
  return target ? { exportMimeType: target.exportMimeType, kind: target.kind } : null;
}

// A typical Sheets/Docs share URL looks like
// https://docs.google.com/spreadsheets/d/<ID>/edit#gid=0 or
// https://docs.google.com/document/d/<ID>/edit — the file id is always the
// path segment right after "/d/", regardless of doc type.
export function extractDriveFileId(url: string): string | null {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// Returns a currently-valid access token for this user's stored Google
// grant, refreshing it first if it's expired (or about to be within the
// next minute). Returns null if the user has never granted the
// drive.readonly scope (no row at all) or if the stored refresh token has
// been revoked — either way, callers should fall back to opening the
// original link instead of treating this as a hard error.
export async function getValidGoogleAccessToken(userId: string): Promise<string | null> {
  const row = await prisma.googleOAuthToken.findUnique({ where: { userId } });
  if (!row) return null;

  const stillValid = row.expiresAt.getTime() > Date.now() + 60_000;
  if (stillValid) return row.accessToken;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET env vars are required to refresh Google access tokens");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: row.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    // Refresh token revoked/invalid (e.g. user removed the app's access in
    // their Google account) — drop the stale row so future calls
    // short-circuit straight to "not granted" instead of retrying forever.
    await prisma.googleOAuthToken.delete({ where: { userId } }).catch(() => {});
    return null;
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  await prisma.googleOAuthToken.update({ where: { userId }, data: { accessToken: data.access_token, expiresAt } });
  return data.access_token;
}

// Exports a Google Sheet/Doc as bytes in the given mime type, authenticated
// as the given user — succeeds only if that user actually has at least
// viewer access to the file in Drive, which is exactly the access check we
// want (no separate permission logic needed on our side; Google's own ACL
// is the source of truth). Returns null on any failure (no grant, no
// access, deleted file, etc.) — the caller treats every case the same way:
// fall back to the original externalUrl.
export async function exportDriveFile(userId: string, fileId: string, exportMimeType: string): Promise<Buffer | null> {
  const accessToken = await getValidGoogleAccessToken(userId);
  if (!accessToken) return null;

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMimeType)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

function requireSignSecret(): string {
  if (!SHEET_EXPORT_SECRET) {
    throw new Error("SHEET_EXPORT_SECRET env var is required");
  }
  return SHEET_EXPORT_SECRET;
}

function sign(documentId: string, userId: string, expires: number): string {
  return createHmac("sha256", requireSignSecret()).update(`${documentId}:${userId}:${expires}`).digest("hex");
}

// The drive-export route is fetched directly by the browser's own script
// (SpreadsheetViewer/PdfViewer's plain fetch(url), same as it already does
// for an S3 presigned URL — no Authorization header attached), so it can't
// rely on our normal Bearer-JWT auth middleware. Signed instead, same HMAC
// pattern storage-local.ts uses for local-disk file serving, just scoped to
// a specific (documentId, userId) pair rather than a storage key. Doesn't
// encode the export format itself — the route re-derives that from the
// document's own externalUrl, so there's nothing here for a client to
// tamper with beyond which (already-authorized) document/user it's for.
export function signDriveExportUrl(documentId: string, userId: string): { url: string; expiresIn: number } {
  const expires = Date.now() + SIGNED_URL_TTL_SECONDS * 1000;
  const sig = sign(documentId, userId, expires);
  const url = `${PUBLIC_URL}/api/documents/${documentId}/drive-export?userId=${encodeURIComponent(userId)}&expires=${expires}&sig=${sig}`;
  return { url, expiresIn: SIGNED_URL_TTL_SECONDS };
}

export function verifyDriveExportRequest(documentId: string, userId: string, expires: number, sig: string): boolean {
  if (!Number.isFinite(expires) || Date.now() > expires) return false;
  const expected = Buffer.from(sign(documentId, userId, expires));
  const actual = Buffer.from(sig);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
