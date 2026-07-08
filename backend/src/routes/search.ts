import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { documentInclude, serializeDocument, loadPinnedIds } from "../lib/document-serializer.js";

export const searchRouter = Router();

// GET /api/search?q=<term> — ILIKE against the document title only. Used to
// also match team/product/category names too, but that produced confusing
// results (e.g. searching "re" surfacing an unrelated doc purely because it
// was tagged "Research") — title-only is more predictable, at the cost of
// not being able to search by tag name. Revisit if that's ever wanted back.
searchRouter.get("/", requireAuth, async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) return res.json([]);

  const docs = await prisma.document.findMany({
    where: {
      deletedAt: null,
      status: "PUBLISHED",
      title: { contains: q, mode: "insensitive" },
    },
    include: documentInclude,
    orderBy: { updatedAt: "desc" },
  });

  const pinnedIds = await loadPinnedIds(req.user!.userId, docs.map((d) => d.id));
  res.json(docs.map((d) => serializeDocument(d, pinnedIds)));
});
