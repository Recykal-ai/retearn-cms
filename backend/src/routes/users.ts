import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const usersRouter = Router();

const PROMOTABLE_ROLES = ["SUPER_ADMIN", "ADMIN", "USER"] as const;

async function validateAndApplyScope(userId: string, rawTeamIds: unknown, rawProductIds: unknown) {
  const teamIdList = Array.isArray(rawTeamIds) ? rawTeamIds.filter((v): v is string => typeof v === "string") : [];
  const productIdList = Array.isArray(rawProductIds)
    ? rawProductIds.filter((v): v is string => typeof v === "string")
    : [];

  if (teamIdList.length > 0) {
    const count = await prisma.team.count({ where: { id: { in: teamIdList } } });
    if (count !== teamIdList.length) return { error: "one or more teamIds do not exist" } as const;
  }
  if (productIdList.length > 0) {
    const count = await prisma.product.count({ where: { id: { in: productIdList } } });
    if (count !== productIdList.length) return { error: "one or more productIds do not exist" } as const;
  }

  await prisma.$transaction([
    prisma.adminScope.deleteMany({ where: { userId } }),
    ...teamIdList.map((teamId) => prisma.adminScope.create({ data: { userId, teamId } })),
    ...productIdList.map((productId) => prisma.adminScope.create({ data: { userId, productId } })),
  ]);

  return { teamIdList, productIdList } as const;
}

// Listing users has no separate spot in the locked API surface, but the Super
// Admin needs some way to find a user's id to promote/demote them — this is
// the minimal lookup that makes that screen possible, not a general users API.
// Removed accounts (active: false) are excluded — that's the whole point of
// "remove from the list" — but the row itself stays in the database so their
// documents/audit history keep a real name attached to them.
usersRouter.get("/", requireAuth, requireRole("SUPER_ADMIN"), async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
      adminScopes: {
        select: {
          teamId: true,
          team: { select: { name: true } },
          productId: true,
          product: { select: { name: true } },
        },
      },
    },
  });

  res.json(
    users.map(({ adminScopes, ...user }) => ({
      ...user,
      // null = global admin (or not an admin at all); a non-null, possibly-empty
      // array means "scoped, restricted to exactly these teams/products".
      adminScope:
        user.role === "ADMIN" && adminScopes.length > 0
          ? adminScopes.map((s) => ({
              teamId: s.teamId,
              teamName: s.team?.name ?? null,
              productId: s.productId,
              productName: s.product?.name ?? null,
            }))
          : null,
    })),
  );
});

// Full promote/demote across all three roles, including Super Admin itself —
// deliberately no last-Super-Admin lockout guard (an explicit product call).
// A Super Admin can promote another account to Super Admin, or demote one
// (including themselves) straight back down; recovering from a mistake here
// means seeding a new Super Admin directly in the database, same as bootstrap.
usersRouter.patch<{ id: string }>("/:id/role", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
  const { role } = req.body as { role?: string };
  if (!role || !PROMOTABLE_ROLES.includes(role as (typeof PROMOTABLE_ROLES)[number])) {
    return res.status(400).json({ error: "role must be one of SUPER_ADMIN, ADMIN, USER" });
  }

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) {
    return res.status(404).json({ error: "User not found" });
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { role: role as "SUPER_ADMIN" | "ADMIN" | "USER" },
  });

  // Scope rows only mean something while the account is actually a (non-super)
  // Admin. Moving to USER or SUPER_ADMIN retires them; a later re-promotion
  // to ADMIN starts global by default, same as any brand-new Admin.
  if (role !== "ADMIN") {
    await prisma.adminScope.deleteMany({ where: { userId: target.id } });
  }

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: "role_change",
      targetId: target.id,
      metadata: { from: target.role, to: updated.role },
    },
  });

  res.json({ id: updated.id, email: updated.email, name: updated.name, role: updated.role });
});

// PUT /api/users/:id/admin-scope — Super Admin only. Body: { teamIds: string[], productIds: string[] }.
// Both empty = global admin (unrestricted). Only meaningful for role=ADMIN users;
// Super Admin stays global-only by definition and is never scoped.
usersRouter.put<{ id: string }>("/:id/admin-scope", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) {
    return res.status(404).json({ error: "User not found" });
  }
  if (target.role !== "ADMIN") {
    return res.status(400).json({ error: "Scoping only applies to Admin accounts" });
  }

  const { teamIds, productIds } = req.body as { teamIds?: unknown; productIds?: unknown };
  const result = await validateAndApplyScope(target.id, teamIds, productIds);
  if ("error" in result) {
    return res.status(400).json({ error: result.error });
  }

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: "admin_scope_change",
      targetId: target.id,
      metadata: { teamIds: result.teamIdList, productIds: result.productIdList },
    },
  });

  res.json({ ok: true, global: result.teamIdList.length === 0 && result.productIdList.length === 0 });
});

// PATCH /api/users/:id/active — Super Admin only. Body: { active: false } to
// remove someone: they're signed out on their very next request (requireAuth
// checks this live) and disappear from the Access list, but there's no login
// block — signing back in with Google immediately restores them (see
// routes/auth.ts). No self-removal guard, same no-lockout philosophy as role
// changes; removing yourself just means you have to sign back in.
usersRouter.patch<{ id: string }>("/:id/active", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
  const { active } = req.body as { active?: unknown };
  if (typeof active !== "boolean") {
    return res.status(400).json({ error: "active must be a boolean" });
  }

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) {
    return res.status(404).json({ error: "User not found" });
  }

  const updated = await prisma.user.update({ where: { id: target.id }, data: { active } });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: active ? "restore_user" : "remove_user",
      targetId: target.id,
    },
  });

  res.json({ id: updated.id, email: updated.email, name: updated.name, role: updated.role, active: updated.active });
});

// POST /api/users — Super Admin only. Pre-provisions an account by email for
// someone who hasn't signed in yet, with their role (and Admin scope, if any)
// already set. Their real name is unknown until their first real Google
// login (which also re-checks the @recykal.com domain server-side, same as
// any other sign-in) — until then they're listed under a placeholder name.
// If the email belongs to someone who's already visible in the list (an
// active row), point the Super Admin at the normal role/scope endpoints
// instead. If it belongs to a previously-removed account, this restores them
// (same row, so their history stays attached) with the newly-chosen role.
usersRouter.post("/", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
  const { email: rawEmail, role, teamIds, productIds } = req.body as {
    email?: string;
    role?: string;
    teamIds?: unknown;
    productIds?: unknown;
  };
  const email = rawEmail?.trim().toLowerCase();
  if (!email || !email.endsWith("@recykal.com")) {
    return res.status(400).json({ error: "email must be a valid @recykal.com address" });
  }
  if (!role || !PROMOTABLE_ROLES.includes(role as (typeof PROMOTABLE_ROLES)[number])) {
    return res.status(400).json({ error: "role must be one of SUPER_ADMIN, ADMIN, USER" });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing?.active) {
    return res.status(409).json({ error: "This person has already signed in — manage their role from the list above." });
  }

  const target = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { active: true, role: role as "SUPER_ADMIN" | "ADMIN" | "USER" },
      })
    : await prisma.user.create({
        data: { email, name: email.split("@")[0], role: role as "SUPER_ADMIN" | "ADMIN" | "USER" },
      });

  if (role === "ADMIN" && (teamIds || productIds)) {
    const result = await validateAndApplyScope(target.id, teamIds, productIds);
    if ("error" in result) {
      if (existing) {
        // Restoring an existing account — leave it as we found it rather than half-applying.
        await prisma.user.update({ where: { id: target.id }, data: { active: existing.active, role: existing.role } });
      } else {
        // Roll back the just-created account rather than leaving a half-configured invite.
        await prisma.user.delete({ where: { id: target.id } });
      }
      return res.status(400).json({ error: result.error });
    }
  } else if (role !== "ADMIN") {
    await prisma.adminScope.deleteMany({ where: { userId: target.id } });
  }

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: existing ? "restore_user" : "invite_user",
      targetId: target.id,
      metadata: { email, role },
    },
  });

  res.status(201).json({ id: target.id, email: target.email, name: target.name, role: target.role });
});
