import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const personalNoteFoldersRouter = Router();

// Purely owner-scoped, same as personal-notes.ts — no admin bypass at all.
// findFirst + 404 (not 403) on a mismatch so a folder's existence isn't
// leaked to someone who doesn't own it.

personalNoteFoldersRouter.get("/", requireAuth, async (req, res) => {
  const folders = await prisma.personalNoteFolder.findMany({
    where: { userId: req.user!.userId },
    orderBy: { name: "asc" },
  });
  res.json(folders);
});

// Walks up from `startParentId` toward the root, true if `folderId` is
// anywhere in that chain — used to reject a move that would make a folder
// its own ancestor (a cycle the UI's tree-walk would infinite-loop on).
async function wouldCycle(folderId: string, startParentId: string): Promise<boolean> {
  let cursor: string | null = startParentId;
  while (cursor) {
    if (cursor === folderId) return true;
    const parent: { parentId: string | null } | null = await prisma.personalNoteFolder.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = parent?.parentId ?? null;
  }
  return false;
}

personalNoteFoldersRouter.post("/", requireAuth, async (req, res) => {
  const { name, icon, parentId } = req.body as { name?: string; icon?: string | null; parentId?: string | null };
  const trimmed = name?.trim();
  if (!trimmed) return res.status(400).json({ error: "name is required" });

  if (parentId) {
    const parent = await prisma.personalNoteFolder.findFirst({ where: { id: parentId, userId: req.user!.userId } });
    if (!parent) return res.status(400).json({ error: "parentId must be an existing folder you own" });
  }

  const folder = await prisma.personalNoteFolder.create({
    data: { userId: req.user!.userId, name: trimmed, icon: icon || null, parentId: parentId || null },
  });
  res.status(201).json(folder);
});

personalNoteFoldersRouter.patch<{ id: string }>("/:id", requireAuth, async (req, res) => {
  const existing = await prisma.personalNoteFolder.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  });
  if (!existing) return res.status(404).json({ error: "Folder not found" });

  const { name, icon, parentId } = req.body as { name?: string; icon?: string | null; parentId?: string | null };
  if (name !== undefined && !name.trim()) {
    return res.status(400).json({ error: "name cannot be empty" });
  }

  if (parentId !== undefined && parentId !== null) {
    if (parentId === existing.id) {
      return res.status(400).json({ error: "A folder can't be its own parent" });
    }
    const parent = await prisma.personalNoteFolder.findFirst({ where: { id: parentId, userId: req.user!.userId } });
    if (!parent) return res.status(400).json({ error: "parentId must be an existing folder you own" });
    if (await wouldCycle(existing.id, parentId)) {
      return res.status(400).json({ error: "Can't move a folder inside its own descendant" });
    }
  }

  const updated = await prisma.personalNoteFolder.update({
    where: { id: existing.id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(icon !== undefined && { icon: icon || null }),
      ...(parentId !== undefined && { parentId: parentId || null }),
    },
  });
  res.json(updated);
});

// Blocked while non-empty (child folders or notes directly inside) — no
// silent cascade-delete of note content. The caller has to move or delete
// what's inside first.
personalNoteFoldersRouter.delete<{ id: string }>("/:id", requireAuth, async (req, res) => {
  const existing = await prisma.personalNoteFolder.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  });
  if (!existing) return res.status(404).json({ error: "Folder not found" });

  const [childCount, noteCount] = await Promise.all([
    prisma.personalNoteFolder.count({ where: { parentId: existing.id } }),
    prisma.personalNote.count({ where: { folderId: existing.id } }),
  ]);
  if (childCount > 0 || noteCount > 0) {
    return res.status(400).json({ error: "Move or delete everything inside this folder first" });
  }

  await prisma.personalNoteFolder.delete({ where: { id: existing.id } });
  res.status(204).send();
});
