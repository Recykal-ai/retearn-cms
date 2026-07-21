import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { sanitizeNoteHtml } from "../lib/sanitize-html.js";

export const personalNotesRouter = Router();

// Purely owner-scoped everywhere here — no admin bypass at all, not even
// Super Admin. findFirst + 404 (not 403) on a mismatch so a note's mere
// existence isn't leaked to someone who doesn't own it.

personalNotesRouter.get("/", requireAuth, async (req, res) => {
  const notes = await prisma.personalNote.findMany({
    where: { userId: req.user!.userId },
    include: { team: { select: { id: true, name: true } } },
    orderBy: { updatedAt: "desc" },
  });
  res.json(notes);
});

personalNotesRouter.get<{ id: string }>("/:id", requireAuth, async (req, res) => {
  const note = await prisma.personalNote.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
    include: { team: { select: { id: true, name: true } } },
  });
  if (!note) return res.status(404).json({ error: "Note not found" });
  res.json(note);
});

personalNotesRouter.post("/", requireAuth, async (req, res) => {
  const { title, icon, teamId, folderId, meetingAt, content } = req.body as {
    title?: string;
    icon?: string | null;
    teamId?: string | null;
    folderId?: string | null;
    meetingAt?: string | null;
    content?: string;
  };
  const trimmedTitle = title?.trim();
  if (!trimmedTitle) {
    return res.status(400).json({ error: "title is required" });
  }
  if (teamId) {
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return res.status(400).json({ error: "teamId must be an existing team" });
  }
  if (folderId) {
    const folder = await prisma.personalNoteFolder.findFirst({ where: { id: folderId, userId: req.user!.userId } });
    if (!folder) return res.status(400).json({ error: "folderId must be an existing folder you own" });
  }

  const note = await prisma.personalNote.create({
    data: {
      userId: req.user!.userId,
      title: trimmedTitle,
      icon: icon || null,
      teamId: teamId || null,
      folderId: folderId || null,
      meetingAt: meetingAt ? new Date(meetingAt) : null,
      content: sanitizeNoteHtml(content ?? ""),
    },
    include: { team: { select: { id: true, name: true } } },
  });
  res.status(201).json(note);
});

personalNotesRouter.patch<{ id: string }>("/:id", requireAuth, async (req, res) => {
  const existing = await prisma.personalNote.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  });
  if (!existing) return res.status(404).json({ error: "Note not found" });

  const { title, icon, teamId, folderId, meetingAt, content } = req.body as {
    title?: string;
    icon?: string | null;
    teamId?: string | null;
    folderId?: string | null;
    meetingAt?: string | null;
    content?: string;
  };

  if (teamId) {
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return res.status(400).json({ error: "teamId must be an existing team" });
  }
  if (folderId) {
    const folder = await prisma.personalNoteFolder.findFirst({ where: { id: folderId, userId: req.user!.userId } });
    if (!folder) return res.status(400).json({ error: "folderId must be an existing folder you own" });
  }
  if (title !== undefined && !title.trim()) {
    return res.status(400).json({ error: "title cannot be empty" });
  }

  const updated = await prisma.personalNote.update({
    where: { id: existing.id },
    data: {
      ...(title !== undefined && { title: title.trim() }),
      ...(icon !== undefined && { icon: icon || null }),
      ...(teamId !== undefined && { teamId: teamId || null }),
      ...(folderId !== undefined && { folderId: folderId || null }),
      ...(meetingAt !== undefined && { meetingAt: meetingAt ? new Date(meetingAt) : null }),
      ...(content !== undefined && { content: sanitizeNoteHtml(content) }),
    },
    include: { team: { select: { id: true, name: true } } },
  });
  res.json(updated);
});

// Hard delete — a private scratchpad, deliberately not soft-deleted/recoverable
// like documents are.
personalNotesRouter.delete<{ id: string }>("/:id", requireAuth, async (req, res) => {
  const existing = await prisma.personalNote.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  });
  if (!existing) return res.status(404).json({ error: "Note not found" });

  await prisma.personalNote.delete({ where: { id: existing.id } });
  res.status(204).send();
});
