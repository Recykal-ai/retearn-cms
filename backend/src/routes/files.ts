import { Router } from "express";
import { createReadStream, existsSync } from "fs";
import { verifySignedFileRequest, localStorage } from "../lib/storage-local.js";
import { mimeTypeFor } from "../lib/mime-types.js";

export const filesRouter = Router();

// Deliberately outside /api — this is a signed, short-lived, GetObject-only
// link (the local-disk stand-in for an S3/R2 presigned URL), not a JWT-protected
// JSON endpoint. Content-Disposition: inline keeps it view-only in-browser.
// Only ever hit when STORAGE_PROVIDER=local — R2's own presigned URLs point
// straight at R2 and never touch this route (see storage.ts / storage-r2.ts).
filesRouter.get("/", (req, res) => {
  const key = typeof req.query.key === "string" ? req.query.key : undefined;
  const expires = Number(req.query.expires);
  const sig = typeof req.query.sig === "string" ? req.query.sig : undefined;

  if (!key || !sig || !verifySignedFileRequest(key, expires, sig)) {
    return res.status(403).json({ error: "Invalid or expired link" });
  }

  const filePath = localStorage.filePath(key);
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  res.setHeader("Content-Type", mimeTypeFor(key));
  res.setHeader("Content-Disposition", "inline");
  createReadStream(filePath).pipe(res);
});
