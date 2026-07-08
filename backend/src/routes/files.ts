import { Router } from "express";
import { createReadStream, existsSync } from "fs";
import { extname } from "path";
import { verifySignedFileRequest, localStorage } from "../lib/storage.js";

export const filesRouter = Router();

const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
  ".xlsb": "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Text/code/markup — the frontend's in-browser viewer fetches these as
  // plain text and renders them itself regardless of Content-Type, but a
  // correct mime type still matters if the signed URL is ever opened directly.
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".log": "text/plain",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".json": "application/json",
  ".xml": "application/xml",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".js": "text/javascript",
  ".jsx": "text/javascript",
  ".mjs": "text/javascript",
  ".cjs": "text/javascript",
  ".ts": "text/plain",
  ".tsx": "text/plain",
  ".py": "text/x-python",
  ".rb": "text/plain",
  ".php": "text/plain",
  ".java": "text/x-java-source",
  ".kt": "text/plain",
  ".swift": "text/plain",
  ".c": "text/plain",
  ".h": "text/plain",
  ".cpp": "text/plain",
  ".hpp": "text/plain",
  ".cc": "text/plain",
  ".cs": "text/plain",
  ".go": "text/plain",
  ".rs": "text/plain",
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".scss": "text/plain",
  ".sass": "text/plain",
  ".less": "text/plain",
  ".sh": "application/x-sh",
  ".bash": "application/x-sh",
  ".zsh": "application/x-sh",
  ".sql": "application/sql",
  ".ini": "text/plain",
  ".toml": "text/plain",
  ".cfg": "text/plain",
  ".conf": "text/plain",
  ".env": "text/plain",
  ".properties": "text/plain",
  ".vue": "text/plain",
  ".svelte": "text/plain",
};

// Deliberately outside /api — this is a signed, short-lived, GetObject-only
// link (the local-disk stand-in for an S3 presigned URL), not a JWT-protected
// JSON endpoint. Content-Disposition: inline keeps it view-only in-browser.
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

  const mime = MIME_TYPES[extname(key).toLowerCase()] ?? "application/octet-stream";
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Disposition", "inline");
  createReadStream(filePath).pipe(res);
});
