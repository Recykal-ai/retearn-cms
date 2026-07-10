import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { sanitizeNoteHtml, extractMentionIds } from "../lib/sanitize-html.js";
import { isTeamNoteMember, canCurateTeamNotes } from "../lib/notes-access.js";
import { loadAdminScope } from "../lib/admin-scope.js";

export const teamNotesRouter = Router();

function isAdminRole(role: string): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

function parseIdArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
}

// GET /api/team-notes — every team note the current user is a member of,
// across every team. Membership-only, no admin bypass — see notes-access.ts.
teamNotesRouter.get("/", requireAuth, async (req, res) => {
  const notes = await prisma.teamNote.findMany({
    where: { members: { some: { userId: req.user!.userId } } },
    include: { team: { select: { id: true, name: true } } },
    orderBy: { updatedAt: "desc" },
  });
  res.json(
    notes.map((n) => ({
      id: n.id,
      teamId: n.teamId,
      teamName: n.team.name,
      title: n.title,
      meetingAt: n.meetingAt,
      updatedAt: n.updatedAt,
    })),
  );
});

// GET /api/team-notes/creatable-teams — teams the current user can create a
// note for (curator power — global Admin/Super Admin see every team, a
// scoped Admin only theirs). Drives the team picker in the creation popup.
// Must come before GET /:id — same reasoning as documents.ts's /recent.
teamNotesRouter.get("/creatable-teams", requireAuth, async (req, res) => {
  if (!isAdminRole(req.user!.role)) return res.json([]);
  const scope = await loadAdminScope(req.user!.userId, req.user!.role);
  const teams = await prisma.team.findMany({
    where: { name: { not: "Others" }, ...(scope !== null ? { id: { in: [...scope.teamIds] } } : {}) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  res.json(teams);
});

// GET /api/team-notes/candidate-users?teamId=&q= — curator-only for the
// given team, used by the creation popup (no note exists yet, so nobody to
// exclude). Must come before GET /:id.
teamNotesRouter.get("/candidate-users", requireAuth, async (req, res) => {
  const teamId = typeof req.query.teamId === "string" ? req.query.teamId : "";
  if (!teamId || !(await canCurateTeamNotes(req.user!.userId, req.user!.role, teamId))) {
    return res.status(403).json({ error: "You don't have admin access to this team" });
  }
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const users = await prisma.user.findMany({
    where: {
      active: true,
      ...(q
        ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }
        : {}),
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
    take: 20,
  });
  res.json(users);
});

// POST /api/team-notes — creates a note for a team, with its initial member
// list, in one step (the creator is always included, whether or not they
// explicitly picked themselves) — no "created but nobody can see it" gap.
teamNotesRouter.post("/", requireAuth, async (req, res) => {
  const { teamId, title, meetingAt, memberIds } = req.body as {
    teamId?: string;
    title?: string;
    meetingAt?: string | null;
    memberIds?: unknown;
  };
  if (!teamId || !(await canCurateTeamNotes(req.user!.userId, req.user!.role, teamId))) {
    return res.status(403).json({ error: "You don't have admin access to this team" });
  }
  const trimmedTitle = title?.trim();
  if (!trimmedTitle) return res.status(400).json({ error: "title is required" });

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) return res.status(400).json({ error: "teamId must be an existing team" });

  const pickedIds = new Set(parseIdArray(memberIds));
  pickedIds.add(req.user!.userId); // creator is always a member of their own note

  const note = await prisma.teamNote.create({
    data: {
      teamId,
      title: trimmedTitle,
      meetingAt: meetingAt ? new Date(meetingAt) : null,
      createdById: req.user!.userId,
      members: {
        create: [...pickedIds].map((userId) => ({ userId, addedById: req.user!.userId })),
      },
    },
  });

  res.status(201).json({ id: note.id, teamId: note.teamId, title: note.title, meetingAt: note.meetingAt });
});

teamNotesRouter.get<{ id: string }>("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!(await isTeamNoteMember(req.user!.userId, id))) {
    return res.status(403).json({ error: "You don't have access to this note" });
  }

  const note = await prisma.teamNote.findUnique({
    where: { id },
    include: {
      team: { select: { id: true, name: true } },
      members: { include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { addedAt: "asc" } },
    },
  });
  if (!note) return res.status(404).json({ error: "Note not found" });

  const canCurate = await canCurateTeamNotes(req.user!.userId, req.user!.role, note.teamId);

  res.json({
    id: note.id,
    teamId: note.teamId,
    teamName: note.team.name,
    title: note.title,
    meetingAt: note.meetingAt,
    content: note.content,
    updatedAt: note.updatedAt,
    canCurate,
    members: note.members.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email, addedAt: m.addedAt })),
  });
});

teamNotesRouter.put<{ id: string }>("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!(await isTeamNoteMember(req.user!.userId, id))) {
    return res.status(403).json({ error: "You don't have access to this note" });
  }

  const { title, meetingAt, content } = req.body as { title?: string; meetingAt?: string | null; content?: string };
  const existing = await prisma.teamNote.findUniqueOrThrow({ where: { id } });
  const sanitized = content !== undefined ? sanitizeNoteHtml(content) : existing.content;

  const members = await prisma.teamNoteMembership.findMany({ where: { teamNoteId: id }, select: { userId: true } });
  const memberIds = new Set(members.map((m) => m.userId));

  const oldMentions = new Set(extractMentionIds(existing.content).filter((mid) => memberIds.has(mid)));
  const newMentions = new Set(extractMentionIds(sanitized).filter((mid) => memberIds.has(mid)));
  const newlyMentioned = [...newMentions].filter((mid) => !oldMentions.has(mid) && mid !== req.user!.userId);

  const updated = await prisma.teamNote.update({
    where: { id },
    data: {
      ...(title !== undefined && title.trim() && { title: title.trim() }),
      ...(meetingAt !== undefined && { meetingAt: meetingAt ? new Date(meetingAt) : null }),
      content: sanitized,
    },
  });

  if (newlyMentioned.length > 0) {
    await prisma.notification.createMany({
      data: newlyMentioned.map((userId) => ({ userId, teamNoteId: id, triggeredById: req.user!.userId })),
    });
  }

  res.json({ id: updated.id, title: updated.title, meetingAt: updated.meetingAt, content: updated.content, updatedAt: updated.updatedAt });
});

teamNotesRouter.post<{ id: string }>("/:id/members", requireAuth, async (req, res) => {
  const { id } = req.params;
  const note = await prisma.teamNote.findUnique({ where: { id } });
  if (!note) return res.status(404).json({ error: "Note not found" });
  if (!(await canCurateTeamNotes(req.user!.userId, req.user!.role, note.teamId))) {
    return res.status(403).json({ error: "You don't have admin access to this team" });
  }

  const { userId } = req.body as { userId?: string };
  if (!userId) return res.status(400).json({ error: "userId is required" });
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.active) return res.status(400).json({ error: "userId must be an existing, active user" });

  await prisma.teamNoteMembership.upsert({
    where: { userId_teamNoteId: { userId, teamNoteId: id } },
    create: { userId, teamNoteId: id, addedById: req.user!.userId },
    update: {},
  });

  await prisma.auditLog.create({
    data: { userId: req.user!.userId, action: "add_team_note_member", targetId: id, metadata: { addedUserId: userId } },
  });

  res.status(201).json({ id: user.id, name: user.name, email: user.email });
});

teamNotesRouter.delete<{ id: string; userId: string }>("/:id/members/:userId", requireAuth, async (req, res) => {
  const { id, userId } = req.params;
  const note = await prisma.teamNote.findUnique({ where: { id } });
  if (!note) return res.status(404).json({ error: "Note not found" });
  if (!(await canCurateTeamNotes(req.user!.userId, req.user!.role, note.teamId))) {
    return res.status(403).json({ error: "You don't have admin access to this team" });
  }

  await prisma.teamNoteMembership.deleteMany({ where: { teamNoteId: id, userId } });

  await prisma.auditLog.create({
    data: { userId: req.user!.userId, action: "remove_team_note_member", targetId: id, metadata: { removedUserId: userId } },
  });

  res.status(204).send();
});

// GET /api/team-notes/:id/candidate-users?q= — curator-only for the note's
// team, excludes existing members. Used when adding more people later.
teamNotesRouter.get<{ id: string }>("/:id/candidate-users", requireAuth, async (req, res) => {
  const { id } = req.params;
  const note = await prisma.teamNote.findUnique({ where: { id } });
  if (!note) return res.status(404).json({ error: "Note not found" });
  if (!(await canCurateTeamNotes(req.user!.userId, req.user!.role, note.teamId))) {
    return res.status(403).json({ error: "You don't have admin access to this team" });
  }

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const existingMemberIds = (
    await prisma.teamNoteMembership.findMany({ where: { teamNoteId: id }, select: { userId: true } })
  ).map((m) => m.userId);

  const users = await prisma.user.findMany({
    where: {
      active: true,
      id: { notIn: existingMemberIds },
      ...(q
        ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }
        : {}),
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
    take: 20,
  });
  res.json(users);
});
