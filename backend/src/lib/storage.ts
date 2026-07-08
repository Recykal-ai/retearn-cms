import { localStorage } from "./storage-local.js";
import { s3Storage } from "./storage-s3.js";

export interface StorageAdapter {
  save(key: string, buffer: Buffer): Promise<void>;
  getSignedUrl(key: string): Promise<{ url: string; expiresIn: number }>;
  delete(key: string): Promise<void>;
}

// Swapping providers is exactly this env var — no route, schema, or call-site
// changes anywhere else. "local" (default) keeps today's behavior; "s3" points
// at real AWS S3 instead. files.ts's /files route only applies to local mode —
// S3's own presigned URLs point straight at S3, no proxy needed — so it still
// imports storage-local.ts directly for that.
const PROVIDER = process.env.STORAGE_PROVIDER ?? "local";

export const storage: StorageAdapter = PROVIDER === "s3" ? s3Storage : localStorage;
