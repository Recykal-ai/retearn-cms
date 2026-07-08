import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { loadAdminScope } from "../lib/admin-scope.js";

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
// no filtering or pagination beyond a max row count. A scoped Admin only sees
// entries for documents within their own team/product scope — same principle
// as everywhere else scoping applies, so a scoped Admin's "audit visibility"
// doesn't quietly exceed their actual management powers.
auditLogRouter.get("/", requireAuth, requireRole("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const scope = await loadAdminScope(req.user!.userId, req.user!.role);

  const where: Record<string, unknown> = { action: { in: DOCUMENT_ACTIONS } };
  if (scope !== null) {
    const teamIds = [...scope.teamIds];
    const productIds = [...scope.productIds];
    const scopedDocs = await prisma.document.findMany({
      where: {
        OR: [
          ...(teamIds.length ? [{ ownerTeamId: { in: teamIds } }] : []),
          ...(productIds.length ? [{ products: { some: { productId: { in: productIds } } } }] : []),
        ],
      },
      select: { id: true },
    });
    where.targetId = { in: scopedDocs.map((d) => d.id) };
  }

  const entries = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  res.json(entries);
});
