import { prisma } from "./prisma.js";

export interface ScopedAdmin {
  teamIds: Set<string>;
  productIds: Set<string>;
}

// null = unrestricted — either SUPER_ADMIN, or an ADMIN with zero AdminScope
// rows (the default "global admin" behavior every existing Admin already has).
export async function loadAdminScope(userId: string, role: string): Promise<ScopedAdmin | null> {
  if (role !== "ADMIN") return null;
  const rows = await prisma.adminScope.findMany({ where: { userId } });
  if (rows.length === 0) return null;
  return {
    teamIds: new Set(rows.filter((r) => r.teamId).map((r) => r.teamId as string)),
    productIds: new Set(rows.filter((r) => r.productId).map((r) => r.productId as string)),
  };
}

export function canManageTeamOrProducts(
  scope: ScopedAdmin | null,
  teamId: string | null | undefined,
  productIds: string[],
): boolean {
  if (scope === null) return true;
  if (teamId && scope.teamIds.has(teamId)) return true;
  return productIds.some((id) => scope.productIds.has(id));
}

export interface NotifiableAdmin {
  id: string;
  name: string;
  email: string;
}

// Reverse of canManageTeamOrProducts — given a document's team/product
// scope, who should be notified? The union of every active SUPER_ADMIN
// (always global), every active ADMIN with zero AdminScope rows (the same
// "global admin" default loadAdminScope treats as unrestricted), and every
// active ADMIN whose rows match this teamId or any of these productIds.
// `active: true` mirrors middleware/auth.ts's own login gate — a
// deactivated admin shouldn't get emailed either. Also filters out anyone
// who's turned off email notifications (see PATCH /api/users/me) — this
// helper's result only ever feeds an email send (confirmed: no other
// caller in the codebase), so it's safe to apply the preference here once
// rather than at every call site.
export async function getAdminsForTeamOrProducts(
  teamId: string | null | undefined,
  productIds: string[],
): Promise<NotifiableAdmin[]> {
  const admins = await prisma.user.findMany({
    where: { active: true, role: { in: ["SUPER_ADMIN", "ADMIN"] }, emailNotificationsEnabled: true },
    include: { adminScopes: true },
  });
  return admins
    .filter((a) => {
      if (a.role === "SUPER_ADMIN") return true;
      if (a.adminScopes.length === 0) return true; // global admin
      return a.adminScopes.some((s) => (teamId && s.teamId === teamId) || (s.productId && productIds.includes(s.productId)));
    })
    .map((a) => ({ id: a.id, name: a.name, email: a.email }));
}
