import { createHmac, timingSafeEqual } from "crypto";
import { mkdir, writeFile, unlink } from "fs/promises";
import { dirname, join } from "path";

// Local-disk storage adapter for Phase 1. Swapping to a real object store
// means writing one new adapter with the same three methods (save/getSignedUrl/delete)
// and flipping STORAGE_PROVIDER — see storage.ts and storage-r2.ts.

const UPLOAD_ROOT = process.env.UPLOAD_ROOT ?? join(process.cwd(), "uploads");
const FILE_URL_SECRET = process.env.FILE_URL_SECRET;
if (!FILE_URL_SECRET) {
  throw new Error("FILE_URL_SECRET env var is required");
}
const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
const SIGNED_URL_TTL_SECONDS = 300;

function sign(key: string, expires: number): string {
  return createHmac("sha256", FILE_URL_SECRET!).update(`${key}:${expires}`).digest("hex");
}

export function verifySignedFileRequest(key: string, expires: number, sig: string): boolean {
  if (!Number.isFinite(expires) || Date.now() > expires) return false;
  const expected = Buffer.from(sign(key, expires));
  const actual = Buffer.from(sig);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export const localStorage = {
  async save(key: string, buffer: Buffer): Promise<void> {
    const filePath = join(UPLOAD_ROOT, key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
  },

  async getSignedUrl(key: string): Promise<{ url: string; expiresIn: number }> {
    const expires = Date.now() + SIGNED_URL_TTL_SECONDS * 1000;
    const sig = sign(key, expires);
    const url = `${PUBLIC_URL}/files?key=${encodeURIComponent(key)}&expires=${expires}&sig=${sig}`;
    return { url, expiresIn: SIGNED_URL_TTL_SECONDS };
  },

  async delete(key: string): Promise<void> {
    await unlink(join(UPLOAD_ROOT, key)).catch(() => {});
  },

  filePath(key: string): string {
    return join(UPLOAD_ROOT, key);
  },
};
