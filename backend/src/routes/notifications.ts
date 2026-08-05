import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const notificationsRouter = Router();

// All owner-scoped — a notification is only ever visible to its own recipient.

// Polymorphic — a row is either a MENTION (teamNote* fields set) or one of
// the four document-approval-flow outcomes (document* fields set). Exactly
// one side is non-null per row, matching `type`.
//
// Unread-only by design — this backs the bell's dropdown, which is meant to
// behave like an inbox of *pending* notifications: once you click one (or
// use "Mark all read"), it's marked read server-side and should never
// resurface here again. The underlying row isn't deleted (still exists for
// e.g. the audit trail), just no longer returned by this default view.
notificationsRouter.get("/", requireAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.userId, read: false },
    include: {
      teamNote: { select: { id: true, title: true, team: { select: { id: true, name: true } } } },
      document: { select: { id: true, title: true } },
      triggeredBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  res.json(
    notifications.map((n) => ({
      id: n.id,
      type: n.type,
      teamNoteId: n.teamNoteId,
      noteTitle: n.teamNote?.title ?? null,
      teamName: n.teamNote?.team.name ?? null,
      commentId: n.commentId,
      documentId: n.documentId,
      documentTitle: n.document?.title ?? null,
      triggeredBy: n.triggeredBy,
      read: n.read,
      createdAt: n.createdAt,
    })),
  );
});

notificationsRouter.get("/unread-count", requireAuth, async (req, res) => {
  const count = await prisma.notification.count({ where: { userId: req.user!.userId, read: false } });
  res.json({ count });
});

notificationsRouter.post<{ id: string }>("/:id/read", requireAuth, async (req, res) => {
  const result = await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.user!.userId },
    data: { read: true },
  });
  if (result.count === 0) return res.status(404).json({ error: "Notification not found" });
  res.json({ ok: true });
});

// POST /api/notifications/read-all — powers the bell's "Mark all read".
notificationsRouter.post("/read-all", requireAuth, async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.userId, read: false },
    data: { read: true },
  });
  res.json({ ok: true });
});

// POST /api/notifications/team-note/:teamNoteId/read — called when a note is
// opened, to clear its unread dot in the folder tree without waiting for a
// per-row click. Only touches MENTION rows for this note — a document
// notification never carries a teamNoteId, so this can't cross-clear one.
notificationsRouter.post<{ teamNoteId: string }>("/team-note/:teamNoteId/read", requireAuth, async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.userId, teamNoteId: req.params.teamNoteId, read: false, type: "MENTION" },
    data: { read: true },
  });
  res.json({ ok: true });
});
