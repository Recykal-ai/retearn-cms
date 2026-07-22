import { localStorage } from "./storage-local.js";
import { s3Storage } from "./storage-s3.js";

export interface StorageAdapter {
  save(key: string, buffer: Buffer): Promise<void>;
  getSignedUrl(key: string): Promise<{ url: string; expiresIn: number }>;
  delete(key: string): Promise<void>;
  // Raw bytes for server-side use only (never expose these directly to a
  // client — that would bypass the signed-URL view-only enforcement). Added
  // for note-to-PDF export (lib/note-pdf.ts), which needs an image's actual
  // bytes to inline as a data: URI for LibreOffice's offline HTML render.
  getBytes(key: string): Promise<Buffer>;
}

// Swapping providers is exactly this env var — no route, schema, or call-site
// changes anywhere else. "local" (default) keeps today's behavior; "s3" points
// at real AWS S3 instead. files.ts's /files route only applies to local mode —
// S3's own presigned URLs point straight at S3, no proxy needed — so it still
// imports storage-local.ts directly for that.
const PROVIDER = process.env.STORAGE_PROVIDER ?? "local";

export const storage: StorageAdapter = PROVIDER === "s3" ? s3Storage : localStorage;
