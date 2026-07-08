import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl as presign } from "@aws-sdk/s3-request-presigner";
import { mimeTypeFor } from "./mime-types.js";

// AWS S3 — the target production storage per the original plan (local disk
// was always a Phase 1 stand-in). Same three-method contract as
// storage-local.ts, chosen via STORAGE_PROVIDER (see storage.ts). S3
// generates its own presigned GetObject URLs directly — no need to proxy
// file bytes through our own /files route or hand-roll HMAC signing.
//
// AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION are the SDK's own
// standard env var names — the S3Client below picks them up automatically
// via its default credential/region provider chain, no explicit wiring needed.
// S3_BUCKET is the one var that isn't SDK-standard, so that's passed explicitly.

// Matches the local adapter's TTL — same view-only enforcement window either way.
const SIGNED_URL_TTL_SECONDS = 300;

let cached: { client: S3Client; bucket: string } | null = null;

// Lazy — storage.ts imports this module unconditionally so it can pick a
// provider at runtime; validating/constructing the client only on first
// actual use means STORAGE_PROVIDER=local still works with zero S3 env vars set.
function getClient(): { client: S3Client; bucket: string } {
  if (cached) return cached;

  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error("S3_BUCKET env var is required when STORAGE_PROVIDER=s3");
  }
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_REGION) {
    throw new Error("AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION env vars are required when STORAGE_PROVIDER=s3");
  }

  cached = { client: new S3Client({}), bucket };
  return cached;
}

export const s3Storage = {
  async save(key: string, buffer: Buffer): Promise<void> {
    const { client, bucket } = getClient();
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: mimeTypeFor(key) }));
  },

  async getSignedUrl(key: string): Promise<{ url: string; expiresIn: number }> {
    const { client, bucket } = getClient();
    // ResponseContentDisposition: inline keeps view-only-in-browser behavior
    // identical to the local adapter's /files route, even though this URL
    // points straight at S3 rather than our own server.
    const url = await presign(client, new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentDisposition: "inline" }), {
      expiresIn: SIGNED_URL_TTL_SECONDS,
    });
    return { url, expiresIn: SIGNED_URL_TTL_SECONDS };
  },

  async delete(key: string): Promise<void> {
    const { client, bucket } = getClient();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {});
  },
};
