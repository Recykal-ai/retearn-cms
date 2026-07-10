import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const notificationsRouter = Router();

// All owner-scoped — a notification is only ever visible to its own recipient.

notificationsRouter.get("/", requireAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.userId },
    include: {
      teamNote: { select: { id: true, title: true, team: { select: { id: true, name: true } } } },
      triggeredBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  res.json(
    notifications.map((n) => ({
      id: n.id,
      teamNoteId: n.teamNoteId,
      noteTitle: n.teamNote.title,
      teamName: n.teamNote.team.name,
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
