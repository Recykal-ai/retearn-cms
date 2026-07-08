import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const auditLogRouter = Router();

// Scoped to document lifecycle events only — upload, new version, tag edits,
// approve/reject, delete/recover, and deletion requests. Deliberately excludes
// "view" (recorded for the Recents feature, see documents.ts, but pure noise
// here — every open/preview would drown out real history) and org-management
// actions (team/product/category deletes, role changes, invites), which are a
// different concern from "what happened to a file".
const DOCUMENT_ACTIONS = [
  "upload",
  "upload_version",
  "revert_version",
  "update_tags",
  "approve",
  "reject",
  "delete",
  "recover",
  "request_deletion",
];

// GET /api/audit-log?limit= — admin only, most recent first. A write-only
// table for the MVP (§9/§13): this is the read side kept intentionally simple,
// no filtering or pagination beyond a max row count.
auditLogRouter.get("/", requireAuth, requireRole("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const entries = await prisma.auditLog.findMany({
    where: { action: { in: DOCUMENT_ACTIONS } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  res.json(entries);
});
