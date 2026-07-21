import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { canCurateTeamNotes } from "../lib/notes-access.js";
import { loadAdminScope } from "../lib/admin-scope.js";

export const teamNoteFoldersRouter = Router();

function isAdminRole(role: string): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

// Every team this user can see folders for: teams where they're a member of
// at least one note (so they can browse that team's tree), unioned with
// teams they curate (an admin scoped/global to a team can see its folder
// structure to organize it, even before any note exists there or they've
// been added to one). Mirrors the same "member OR curator" shape used by
// GET /api/team-notes and the creatable-teams endpoint.
async function visibleTeamIds(userId: string, role: string): Promise<string[]> {
  const memberTeams = await prisma.teamNote.findMany({
    where: { members: { some: { userId } } },
    select: { teamId: true },
    distinct: ["teamId"],
  });
  const ids = new Set(memberTeams.map((t) => t.teamId));

  if (isAdminRole(role)) {
    const scope = await loadAdminScope(userId, role);
    if (scope === null) {
      (await prisma.team.findMany({ select: { id: true } })).forEach((t) => ids.add(t.id));
    } else {
      scope.teamIds.forEach((id) => ids.add(id));
    }
  }
  return [...ids];
}

// GET /api/team-note-folders — every folder across every team this user can
// browse. Folder names aren't access-controlled per-note (a folder is just
// structure); the notes inside remain individually membership-gated, same
// as GET /api/team-notes.
teamNoteFoldersRouter.get("/", requireAuth, async (req, res) => {
  const teamIds = await visibleTeamIds(req.user!.userId, req.user!.role);
  if (teamIds.length === 0) return res.json([]);
  const folders = await prisma.teamNoteFolder.findMany({
    where: { teamId: { in: teamIds } },
    orderBy: { name: "asc" },
  });
  res.json(folders);
});

async function wouldCycle(folderId: string, startParentId: string): Promise<boolean> {
  let cursor: string | null = startParentId;
  while (cursor) {
    if (cursor === folderId) return true;
    const parent: { parentId: string | null } | null = await prisma.teamNoteFolder.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = parent?.parentId ?? null;
  }
  return false;
}

// POST /api/team-note-folders — curator-only (canCurateTeamNotes), same gate
// as creating a team note itself: regular members can't create folders.
teamNoteFoldersRouter.post("/", requireAuth, async (req, res) => {
  const { teamId, name, icon, parentId } = req.body as {
    teamId?: string;
    name?: string;
    icon?: string | null;
    parentId?: string | null;
  };
  if (!teamId || !(await canCurateTeamNotes(req.user!.userId, req.user!.role, teamId))) {
    return res.status(403).json({ error: "You don't have admin access to this team" });
  }
  const trimmed = name?.trim();
  if (!trimmed) return res.status(400).json({ error: "name is required" });

  if (parentId) {
    const parent = await prisma.teamNoteFolder.findFirst({ where: { id: parentId, teamId } });
    if (!parent) return res.status(400).json({ error: "parentId must be an existing folder in this team" });
  }

  const folder = await prisma.teamNoteFolder.create({
    data: { teamId, name: trimmed, icon: icon || null, parentId: parentId || null, createdById: req.user!.userId },
  });
  res.status(201).json(folder);
});

teamNoteFoldersRouter.patch<{ id: string }>("/:id", requireAuth, async (req, res) => {
  const existing = await prisma.teamNoteFolder.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Folder not found" });
  if (!(await canCurateTeamNotes(req.user!.userId, req.user!.role, existing.teamId))) {
    return res.status(403).json({ error: "You don't have admin access to this team" });
  }

  const { name, icon, parentId } = req.body as { name?: string; icon?: string | null; parentId?: string | null };
  if (name !== undefined && !name.trim()) {
    return res.status(400).json({ error: "name cannot be empty" });
  }

  if (parentId !== undefined && parentId !== null) {
    if (parentId === existing.id) {
      return res.status(400).json({ error: "A folder can't be its own parent" });
    }
    // Same-team only — a folder can't be reparented into a different
    // team's tree (that would strand it outside canCurateTeamNotes's own
    // teamId check for anyone editing it afterward).
    const parent = await prisma.teamNoteFolder.findFirst({ where: { id: parentId, teamId: existing.teamId } });
    if (!parent) return res.status(400).json({ error: "parentId must be an existing folder in this team" });
    if (await wouldCycle(existing.id, parentId)) {
      return res.status(400).json({ error: "Can't move a folder inside its own descendant" });
    }
  }

  const updated = await prisma.teamNoteFolder.update({
    where: { id: existing.id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(icon !== undefined && { icon: icon || null }),
      ...(parentId !== undefined && { parentId: parentId || null }),
    },
  });
  res.json(updated);
});

// Blocked while non-empty, same reasoning as personal-note-folders.ts.
teamNoteFoldersRouter.delete<{ id: string }>("/:id", requireAuth, async (req, res) => {
  const existing = await prisma.teamNoteFolder.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Folder not found" });
  if (!(await canCurateTeamNotes(req.user!.userId, req.user!.role, existing.teamId))) {
    return res.status(403).json({ error: "You don't have admin access to this team" });
  }

  const [childCount, noteCount] = await Promise.all([
    prisma.teamNoteFolder.count({ where: { parentId: existing.id } }),
    prisma.teamNote.count({ where: { folderId: existing.id } }),
  ]);
  if (childCount > 0 || noteCount > 0) {
    return res.status(400).json({ error: "Move or delete everything inside this folder first" });
  }

  await prisma.teamNoteFolder.delete({ where: { id: existing.id } });
  res.status(204).send();
});
