import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { isUniqueConstraintError } from "../lib/prisma-errors.js";
import { loadAdminScope } from "../lib/admin-scope.js";
import { getOrCreateOthersTeam, reconcileDocumentFallbacks } from "../lib/fallback-entities.js";
import { backfillGlobalCategories } from "../lib/global-categories.js";

export const teamsRouter = Router();

teamsRouter.get("/", requireAuth, async (_req, res) => {
  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
    // True total — every non-deleted doc regardless of review status. Used
    // where undercounting would be unsafe (e.g. DeleteTagModal's "N
    // documents affected" warning before deleting a team) — a Pending/
    // Rejected doc still needs to show up there even though it's not in
    // anyone's everyday browse view.
    include: { _count: { select: { documents: { where: { deletedAt: null } } } } },
  });
  // What the dashboard's Team sidebar badge shows instead — Published only,
  // via a separate groupBy (not a second _count.select key: Prisma can't
  // count the same relation twice with two different filters in one query)
  // so it matches what browsing into that team's own folders actually
  // displays. A Pending upload or an old Rejected doc isn't there, so it
  // shouldn't be sitting in the sidebar's count either.
  const visibleCounts = await prisma.document.groupBy({
    by: ["ownerTeamId"],
    where: { deletedAt: null, status: "PUBLISHED", ownerTeamId: { in: teams.map((t) => t.id) } },
    _count: true,
  });
  const visibleCountByTeam = new Map(visibleCounts.map((v) => [v.ownerTeamId, v._count]));
  res.json(
    teams.map(({ _count, ...team }) => ({
      ...team,
      documentCount: _count.documents,
      visibleDocumentCount: visibleCountByTeam.get(team.id) ?? 0,
    })),
  );
});

teamsRouter.post("/", requireAuth, requireRole("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const name = (req.body as { name?: string }).name?.trim();
  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }

  // Creating a brand-new team is a structural, org-wide action — a scoped
  // Admin (restricted to specific teams/products) can't do this, only a
  // global Admin (no AdminScope rows) or Super Admin.
  const scope = await loadAdminScope(req.user!.userId, req.user!.role);
  if (scope !== null) {
    return res.status(403).json({ error: "Only a global Admin or Super Admin can create new teams" });
  }

  try {
    const team = await prisma.team.create({ data: { name } });
    await backfillGlobalCategories(team.id);
    res.status(201).json(team);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return res.status(409).json({ error: "A team with that name already exists" });
    }
    throw err;
  }
});

// DELETE /api/teams/:id — global Admin or Super Admin only. Documents owned by
// this team, and any categories scoped to it, get reassigned to the "Others"
// team/category fallback rather than left dangling (see lib/fallback-entities.ts).
teamsRouter.delete<{ id: string }>("/:id", requireAuth, requireRole("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const adminScope = await loadAdminScope(req.user!.userId, req.user!.role);
  if (adminScope !== null) {
    return res.status(403).json({ error: "Only a global Admin or Super Admin can delete teams" });
  }

  const team = await prisma.team.findUnique({ where: { id: req.params.id } });
  if (!team) return res.status(404).json({ error: "Team not found" });
  if (team.name === "Others") {
    return res.status(400).json({ error: "The Others team can't be deleted" });
  }

  const categories = await prisma.category.findMany({ where: { scope: team.id } });
  const categoryIds = categories.map((c) => c.id);

  const affectedDocIds = new Set<string>();
  (await prisma.document.findMany({ where: { ownerTeamId: team.id }, select: { id: true } })).forEach((d) =>
    affectedDocIds.add(d.id),
  );
  if (categoryIds.length > 0) {
    (
      await prisma.documentCategory.findMany({ where: { categoryId: { in: categoryIds } }, select: { documentId: true } })
    ).forEach((d) => affectedDocIds.add(d.documentId));
  }

  await prisma.document.updateMany({ where: { ownerTeamId: team.id }, data: { ownerTeamId: null } });
  if (categoryIds.length > 0) {
    await prisma.documentCategory.deleteMany({ where: { categoryId: { in: categoryIds } } });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
  }
  await prisma.adminScope.deleteMany({ where: { teamId: team.id } });
  // Same "no dangling FK" treatment as everything above: a PersonalNote's
  // teamId is just a filing label, so null it out rather than block the
  // delete; a team's own notes (there can be several now) don't survive the
  // team itself, so those — and their membership/notification rows — are
  // removed outright.
  await prisma.personalNote.updateMany({ where: { teamId: team.id }, data: { teamId: null } });
  const teamNoteIds = (await prisma.teamNote.findMany({ where: { teamId: team.id }, select: { id: true } })).map(
    (n) => n.id,
  );
  if (teamNoteIds.length > 0) {
    await prisma.notification.deleteMany({ where: { teamNoteId: { in: teamNoteIds } } });
    await prisma.teamNoteMembership.deleteMany({ where: { teamNoteId: { in: teamNoteIds } } });
    // Pre-existing gap closed here: activity/comment rows reference a
    // teamNoteId too and were being left dangling once the note itself was
    // deleted below — same "no dangling FK" rule as everything else in this
    // block.
    await prisma.teamNoteComment.deleteMany({ where: { teamNoteId: { in: teamNoteIds } } });
    await prisma.teamNoteActivity.deleteMany({ where: { teamNoteId: { in: teamNoteIds } } });
    await prisma.teamNote.deleteMany({ where: { id: { in: teamNoteIds } } });
  }
  // Folders are purely structural (no notes survive them at this point,
  // since teamNoteIds above are already gone), so a flat delete-by-teamId
  // is enough — no need to walk the parent/child tree.
  await prisma.teamNoteFolder.deleteMany({ where: { teamId: team.id } });
  await prisma.team.delete({ where: { id: team.id } });

  await getOrCreateOthersTeam();
  for (const docId of affectedDocIds) {
    await reconcileDocumentFallbacks(docId);
  }

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: "delete_team",
      targetId: team.id,
      metadata: { name: team.name, affectedDocuments: affectedDocIds.size },
    },
  });
  res.status(204).send();
});
