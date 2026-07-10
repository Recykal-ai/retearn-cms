import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "./prisma.js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SHEET_EXPORT_SECRET = process.env.SHEET_EXPORT_SECRET;
// Same env var storage-local.ts's signed file URLs use — whatever base URL
// is actually reachable by a browser (localhost in dev, the Cloudflare
// tunnel or real deployment host otherwise).
const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const SIGNED_URL_TTL_SECONDS = 300; // matches the FILE storage adapters' TTL

// A typical Sheets share URL looks like
// https://docs.google.com/spreadsheets/d/<ID>/edit#gid=0 — the file id is
// always the path segment right after "/d/".
export function isGoogleSheetsUrl(url: string): boolean {
  return /^https:\/\/docs\.google\.com\/spreadsheets\//.test(url);
}

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

// Exports a Google Sheet as .xlsx bytes, authenticated as the given user —
// succeeds only if that user actually has at least viewer access to the
// file in Drive, which is exactly the access check we want (no separate
// permission logic needed on our side; Google's own ACL is the source of
// truth). Returns null on any failure (no grant, no access, not a Sheet,
// deleted file, etc.) — the caller treats every case the same way: fall
// back to the original externalUrl.
export async function exportSheetAsXlsx(userId: string, fileId: string): Promise<Buffer | null> {
  const accessToken = await getValidGoogleAccessToken(userId);
  if (!accessToken) return null;

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(XLSX_MIME)}`,
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

// The sheet-export route is fetched directly by the browser's own <script>
// (SpreadsheetViewer's plain fetch(url), same as it already does for an S3
// presigned URL — no Authorization header attached), so it can't rely on
// our normal Bearer-JWT auth middleware. Signed instead, same HMAC pattern
// storage-local.ts uses for local-disk file serving, just scoped to a
// specific (documentId, userId) pair rather than a storage key.
export function signSheetExportUrl(documentId: string, userId: string): { url: string; expiresIn: number } {
  const expires = Date.now() + SIGNED_URL_TTL_SECONDS * 1000;
  const sig = sign(documentId, userId, expires);
  const url = `${PUBLIC_URL}/api/documents/${documentId}/sheet-export?userId=${encodeURIComponent(userId)}&expires=${expires}&sig=${sig}`;
  return { url, expiresIn: SIGNED_URL_TTL_SECONDS };
}

export function verifySheetExportRequest(documentId: string, userId: string, expires: number, sig: string): boolean {
  if (!Number.isFinite(expires) || Date.now() > expires) return false;
  const expected = Buffer.from(sign(documentId, userId, expires));
  const actual = Buffer.from(sig);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
