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
