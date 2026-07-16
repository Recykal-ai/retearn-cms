import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import { storage } from "../lib/storage.js";
import { sanitizeFilename } from "../lib/filename.js";

export const noteImagesRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

// Every key this route will ever hand out or resolve lives under this
// prefix — GET /view-url checks it below so a client can't pass an
// arbitrary document's storage key here and get a signed URL for it.
const KEY_PREFIX = "note-images/";

// POST /api/note-images — any authenticated user (note images aren't tied to
// a Document row; access to the *note* they end up embedded in is what's
// actually gated, same as an inline @mention isn't separately permissioned).
// Returns just the storage key — never a URL, since a signed URL would
// expire long before the note itself does. The editor's NoteImage node
// stores this key and re-resolves a fresh signed URL every time it renders
// (see NoteImageExtension.tsx), the same pattern DocumentEmbed already uses
// for embedding an existing document.
noteImagesRouter.post("/", requireAuth, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "file is required" });
  if (!req.file.mimetype.startsWith("image/")) {
    return res.status(400).json({ error: "Only image files are allowed" });
  }

  const key = `${KEY_PREFIX}${randomUUID()}/${sanitizeFilename(req.file.originalname)}`;
  await storage.save(key, req.file.buffer);
  res.status(201).json({ key });
});

// GET /api/note-images/view-url?key= — short-lived signed URL for a
// previously-uploaded note image, same view-only contract as a document's
// view-url (never a permanent/public link).
noteImagesRouter.get("/view-url", requireAuth, async (req, res) => {
  const key = typeof req.query.key === "string" ? req.query.key : "";
  if (!key.startsWith(KEY_PREFIX)) {
    return res.status(400).json({ error: "Invalid image key" });
  }
  const { url, expiresIn } = await storage.getSignedUrl(key);
  res.json({ url, expiresIn });
});
