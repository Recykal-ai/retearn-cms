import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { sanitizeNoteHtml, extractMentionIds } from "../lib/sanitize-html.js";
import { extractImageKeys, extractDocumentEmbedIds, stripStructuralNodes } from "../lib/note-content-diff.js";
import { isTeamNoteMember, canCurateTeamNotes } from "../lib/notes-access.js";
import { loadAdminScope } from "../lib/admin-scope.js";
import type { Prisma } from "../generated/prisma/client.js";

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
      icon: n.icon,
      folderId: n.folderId,
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
      // The creator is always auto-added as a member server-side (see POST
      // / below) regardless of whether they're toggled here — showing them
      // in this picker as an unchecked option looked like a required step
      // that wasn't actually required.
      id: { not: req.user!.userId },
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
  const { teamId, title, icon, folderId, meetingAt, memberIds } = req.body as {
    teamId?: string;
    title?: string;
    icon?: string | null;
    folderId?: string | null;
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

  if (folderId) {
    const folder = await prisma.teamNoteFolder.findFirst({ where: { id: folderId, teamId } });
    if (!folder) return res.status(400).json({ error: "folderId must be an existing folder in this team" });
  }

  const pickedIds = new Set(parseIdArray(memberIds));
  pickedIds.add(req.user!.userId); // creator is always a member of their own note

  const note = await prisma.teamNote.create({
    data: {
      teamId,
      title: trimmedTitle,
      icon: icon || null,
      folderId: folderId || null,
      meetingAt: meetingAt ? new Date(meetingAt) : null,
      createdById: req.user!.userId,
      members: {
        create: [...pickedIds].map((userId) => ({ userId, addedById: req.user!.userId })),
      },
    },
  });

  res.status(201).json({ id: note.id, teamId: note.teamId, title: note.title, icon: note.icon, folderId: note.folderId, meetingAt: note.meetingAt });
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
      createdBy: { select: { id: true, name: true } },
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
    icon: note.icon,
    folderId: note.folderId,
    meetingAt: note.meetingAt,
    content: note.content,
    updatedAt: note.updatedAt,
    canCurate,
    createdBy: { id: note.createdBy.id, name: note.createdBy.name },
    members: note.members.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email, addedAt: m.addedAt })),
  });
});

teamNotesRouter.put<{ id: string }>("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!(await isTeamNoteMember(req.user!.userId, id))) {
    return res.status(403).json({ error: "You don't have access to this note" });
  }

  const { title, icon, folderId, meetingAt, content } = req.body as {
    title?: string;
    icon?: string | null;
    folderId?: string | null;
    meetingAt?: string | null;
    content?: string;
  };
  const existing = await prisma.teamNote.findUniqueOrThrow({ where: { id } });
  const sanitized = content !== undefined ? sanitizeNoteHtml(content) : existing.content;

  // Moving a note between folders is curator-only, same gate as creating a
  // folder in the first place — a regular member editing content shouldn't
  // also be able to reorganize the team's folder structure.
  if (folderId !== undefined) {
    if (!(await canCurateTeamNotes(req.user!.userId, req.user!.role, existing.teamId))) {
      return res.status(403).json({ error: "You don't have admin access to this team" });
    }
    if (folderId) {
      const folder = await prisma.teamNoteFolder.findFirst({ where: { id: folderId, teamId: existing.teamId } });
      if (!folder) return res.status(400).json({ error: "folderId must be an existing folder in this team" });
    }
  }

  const members = await prisma.teamNoteMembership.findMany({ where: { teamNoteId: id }, select: { userId: true } });
  const memberIds = new Set(members.map((m) => m.userId));

  // "all" (see the frontend's TeamNoteEditor.tsx mentionCandidates) is a
  // reserved sentinel id, not a real user — @mentioning it expands to every
  // current member instead of being matched (and dropped) as an unknown id.
  // Both old and new content resolve against the *same* current member set,
  // so re-saving with an unchanged "@All members" mention never re-notifies
  // — identical to how re-saving an unchanged single-person mention doesn't.
  function resolveMentionIds(html: string): Set<string> {
    const raw = extractMentionIds(html);
    if (raw.includes("all")) return new Set(memberIds);
    return new Set(raw.filter((mid) => memberIds.has(mid)));
  }

  const oldMentions = resolveMentionIds(existing.content);
  const newMentions = resolveMentionIds(sanitized);
  const newlyMentioned = [...newMentions].filter((mid) => !oldMentions.has(mid) && mid !== req.user!.userId);

  // Structured "what changed" detection for the update-history feature — see
  // note-content-diff.ts. One activity row per distinguishable change in
  // this single save, not a generic diff of the raw HTML.
  const activityRows: { teamNoteId: string; userId: string; action: string; anchorId: string | null; metadata: object }[] = [];
  const newTitle = title !== undefined && title.trim() ? title.trim() : undefined;
  const titleChanged = newTitle !== undefined && newTitle !== existing.title;
  const meetingAtChanged =
    meetingAt !== undefined && (meetingAt ? new Date(meetingAt).getTime() : null) !== (existing.meetingAt?.getTime() ?? null);
  if (titleChanged || meetingAtChanged) {
    activityRows.push({
      teamNoteId: id,
      userId: req.user!.userId,
      action: "EDITED_DETAILS",
      anchorId: null,
      metadata: { titleChanged, meetingAtChanged },
    });
  }
  if (content !== undefined && sanitized !== existing.content) {
    const oldImageKeys = new Set(extractImageKeys(existing.content));
    const newImageKeys = extractImageKeys(sanitized).filter((k) => !oldImageKeys.has(k));
    for (const key of newImageKeys) {
      activityRows.push({ teamNoteId: id, userId: req.user!.userId, action: "ADDED_IMAGE", anchorId: key, metadata: {} });
    }

    const oldDocIds = new Set(extractDocumentEmbedIds(existing.content));
    const newDocIds = extractDocumentEmbedIds(sanitized).filter((docId) => !oldDocIds.has(docId));
    if (newDocIds.length > 0) {
      const docs = await prisma.document.findMany({ where: { id: { in: newDocIds } }, select: { id: true, title: true } });
      const titleById = new Map(docs.map((d) => [d.id, d.title]));
      for (const docId of newDocIds) {
        activityRows.push({
          teamNoteId: id,
          userId: req.user!.userId,
          action: "LINKED_DOCUMENT",
          anchorId: docId,
          metadata: { title: titleById.get(docId) ?? "Untitled document" },
        });
      }
    }

    if (stripStructuralNodes(sanitized) !== stripStructuralNodes(existing.content)) {
      activityRows.push({ teamNoteId: id, userId: req.user!.userId, action: "EDITED_CONTENT", anchorId: null, metadata: {} });
    }
  }

  const updated = await prisma.teamNote.update({
    where: { id },
    data: {
      ...(newTitle !== undefined && { title: newTitle }),
      ...(icon !== undefined && { icon: icon || null }),
      ...(folderId !== undefined && { folderId: folderId || null }),
      ...(meetingAt !== undefined && { meetingAt: meetingAt ? new Date(meetingAt) : null }),
      content: sanitized,
    },
  });

  if (newlyMentioned.length > 0) {
    await prisma.notification.createMany({
      data: newlyMentioned.map((userId) => ({ userId, teamNoteId: id, triggeredById: req.user!.userId })),
    });
  }
  if (activityRows.length > 0) {
    await prisma.teamNoteActivity.createMany({ data: activityRows as Prisma.TeamNoteActivityCreateManyInput[] });
  }

  res.json({
    id: updated.id,
    title: updated.title,
    icon: updated.icon,
    folderId: updated.folderId,
    meetingAt: updated.meetingAt,
    content: updated.content,
    updatedAt: updated.updatedAt,
  });
});

// DELETE /api/team-notes/:id — curator-only (canCurateTeamNotes), same gate
// as creating one in the first place — since creating a team note already
// requires curator status, its creator is always already a curator, so
// there's no separate "creator can always delete" carve-out to add here.
// Hard delete (unlike Document's soft-delete-and-recover model) — a team
// note has no approval/versioning lifecycle to preserve history for.
teamNotesRouter.delete<{ id: string }>("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const note = await prisma.teamNote.findUnique({ where: { id } });
  if (!note) return res.status(404).json({ error: "Note not found" });
  if (!(await canCurateTeamNotes(req.user!.userId, req.user!.role, note.teamId))) {
    return res.status(403).json({ error: "You don't have admin access to this team" });
  }

  await prisma.notification.deleteMany({ where: { teamNoteId: id } });
  await prisma.teamNoteMembership.deleteMany({ where: { teamNoteId: id } });
  await prisma.teamNoteComment.deleteMany({ where: { teamNoteId: id } });
  await prisma.teamNoteActivity.deleteMany({ where: { teamNoteId: id } });
  await prisma.teamNote.delete({ where: { id } });

  res.status(204).send();
});

// GET /api/team-notes/:id/activity — the note's update history, newest
// first. Membership-only, same gate as viewing the note itself.
teamNotesRouter.get<{ id: string }>("/:id/activity", requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!(await isTeamNoteMember(req.user!.userId, id))) {
    return res.status(403).json({ error: "You don't have access to this note" });
  }
  const rows = await prisma.teamNoteActivity.findMany({
    where: { teamNoteId: id },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json(
    rows.map((r) => ({
      id: r.id,
      action: r.action,
      anchorId: r.anchorId,
      metadata: r.metadata,
      createdAt: r.createdAt,
      user: r.user,
    })),
  );
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

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// GET /api/team-notes/:id/comments — every comment (root threads + replies,
// flattened) for the note; the frontend groups replies under their parentId.
// Membership-only, same gate as the note itself.
teamNotesRouter.get<{ id: string }>("/:id/comments", requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!(await isTeamNoteMember(req.user!.userId, id))) {
    return res.status(403).json({ error: "You don't have access to this note" });
  }
  const comments = await prisma.teamNoteComment.findMany({
    where: { teamNoteId: id },
    include: {
      author: { select: { id: true, name: true } },
      resolvedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  res.json(comments);
});

// POST /api/team-notes/:id/comments — creates a thread root (parentId
// omitted) or a reply (parentId = the thread's root comment id). The
// caller applies the CommentMark to the selection using the returned root
// id *after* this resolves — see RichTextEditor.tsx — so a thread's id
// always doubles as its anchor id, with nothing extra to keep in sync.
// mentionedUserIds is sent by MentionInput.tsx alongside the plain-text body
// (comments aren't rich-HTML like note content, so there's no `data-id`
// span to parse a mention out of — the frontend just tells us directly who
// was @mentioned while composing).
teamNotesRouter.post<{ id: string }>("/:id/comments", requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!(await isTeamNoteMember(req.user!.userId, id))) {
    return res.status(403).json({ error: "You don't have access to this note" });
  }
  const { quotedText, body, parentId, mentionedUserIds } = req.body as {
    quotedText?: string;
    body?: string;
    parentId?: string;
    mentionedUserIds?: unknown;
  };
  const trimmedBody = body?.trim();
  if (!trimmedBody) return res.status(400).json({ error: "body is required" });

  let root: { id: string } | null = null;
  if (parentId) {
    root = await prisma.teamNoteComment.findFirst({ where: { id: parentId, teamNoteId: id, parentId: null } });
    if (!root) return res.status(400).json({ error: "parentId must be an existing thread on this note" });
  }

  const comment = await prisma.teamNoteComment.create({
    data: {
      teamNoteId: id,
      parentId: root?.id ?? null,
      quotedText: (quotedText ?? "").slice(0, 500),
      body: trimmedBody,
      authorId: req.user!.userId,
    },
    include: { author: { select: { id: true, name: true } }, resolvedBy: { select: { id: true, name: true } } },
  });

  await prisma.teamNoteActivity.create({
    data: {
      teamNoteId: id,
      userId: req.user!.userId,
      action: "ADDED_COMMENT",
      anchorId: root?.id ?? comment.id,
      metadata: { quotedText: truncate(quotedText ?? "", 120), isReply: Boolean(root) },
    },
  });

  const mentionIds = parseIdArray(mentionedUserIds);
  if (mentionIds.length > 0) {
    const memberIds = new Set(
      (await prisma.teamNoteMembership.findMany({ where: { teamNoteId: id }, select: { userId: true } })).map(
        (m) => m.userId,
      ),
    );
    const notifyIds = mentionIds.filter((mid) => memberIds.has(mid) && mid !== req.user!.userId);
    if (notifyIds.length > 0) {
      await prisma.notification.createMany({
        data: [...new Set(notifyIds)].map((userId) => ({ userId, teamNoteId: id, triggeredById: req.user!.userId })),
      });
    }
  }

  res.status(201).json(comment);
});

// PATCH /api/team-notes/:id/comments/:commentId — author-only body edit.
// Deliberately doesn't re-run mention notifications (unlike the note-content
// PUT's old/new mention diff) — editing a comment to add a new @mention is a
// rare enough edge case that it isn't worth carrying a second diffing path
// for a plain-text field with no stored history to diff against.
teamNotesRouter.patch<{ id: string; commentId: string }>("/:id/comments/:commentId", requireAuth, async (req, res) => {
  const { id, commentId } = req.params;
  const comment = await prisma.teamNoteComment.findFirst({ where: { id: commentId, teamNoteId: id } });
  if (!comment) return res.status(404).json({ error: "Comment not found" });
  if (comment.authorId !== req.user!.userId) return res.status(403).json({ error: "You can only edit your own comment" });

  const { body } = req.body as { body?: string };
  const trimmedBody = body?.trim();
  if (!trimmedBody) return res.status(400).json({ error: "body is required" });

  const updated = await prisma.teamNoteComment.update({
    where: { id: commentId },
    data: { body: trimmedBody },
    include: { author: { select: { id: true, name: true } }, resolvedBy: { select: { id: true, name: true } } },
  });

  res.json(updated);
});

// PATCH /api/team-notes/:id/comments/:commentId/resolve — any member can
// resolve/reopen a thread (Notion's own behavior isn't author-restricted
// either). Only valid on a thread root; resolving never touches the note's
// content/mark, only this row — see the TeamNoteComment schema comment.
teamNotesRouter.patch<{ id: string; commentId: string }>("/:id/comments/:commentId/resolve", requireAuth, async (req, res) => {
  const { id, commentId } = req.params;
  if (!(await isTeamNoteMember(req.user!.userId, id))) {
    return res.status(403).json({ error: "You don't have access to this note" });
  }
  const { resolved } = req.body as { resolved?: boolean };
  if (typeof resolved !== "boolean") return res.status(400).json({ error: "resolved must be a boolean" });

  const comment = await prisma.teamNoteComment.findFirst({ where: { id: commentId, teamNoteId: id, parentId: null } });
  if (!comment) return res.status(404).json({ error: "Comment thread not found" });

  const updated = await prisma.teamNoteComment.update({
    where: { id: commentId },
    data: resolved
      ? { resolved: true, resolvedById: req.user!.userId, resolvedAt: new Date() }
      : { resolved: false, resolvedById: null, resolvedAt: null },
    include: { author: { select: { id: true, name: true } }, resolvedBy: { select: { id: true, name: true } } },
  });

  await prisma.teamNoteActivity.create({
    data: {
      teamNoteId: id,
      userId: req.user!.userId,
      action: resolved ? "RESOLVED_COMMENT" : "REOPENED_COMMENT",
      anchorId: commentId,
      metadata: { quotedText: truncate(comment.quotedText, 120) },
    },
  });

  res.json(updated);
});

// DELETE /api/team-notes/:id/comments/:commentId — author-only. Deleting a
// thread root takes its replies with it (manual cascade — no onDelete
// cascade anywhere in this schema, same convention as every other model).
teamNotesRouter.delete<{ id: string; commentId: string }>("/:id/comments/:commentId", requireAuth, async (req, res) => {
  const { id, commentId } = req.params;
  const comment = await prisma.teamNoteComment.findFirst({ where: { id: commentId, teamNoteId: id } });
  if (!comment) return res.status(404).json({ error: "Comment not found" });
  if (comment.authorId !== req.user!.userId) return res.status(403).json({ error: "You can only delete your own comment" });

  if (comment.parentId === null) {
    await prisma.teamNoteComment.deleteMany({ where: { parentId: commentId } });
  }
  await prisma.teamNoteComment.delete({ where: { id: commentId } });

  res.status(204).send();
});
