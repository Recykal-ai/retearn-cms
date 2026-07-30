import { describe, it, expect } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { loadAdminScope, canManageTeamOrProducts, getAdminsForTeamOrProducts } from "../../src/lib/admin-scope.js";
import { createTestUser } from "../helpers/auth.js";

async function makeTeam(name = "Team A") {
  return prisma.team.create({ data: { name } });
}
async function makeProduct(name = "Product A") {
  return prisma.product.create({ data: { name } });
}

describe("loadAdminScope", () => {
  it("returns null immediately for SUPER_ADMIN (no scoping possible by design)", async () => {
    const user = await createTestUser("SUPER_ADMIN");
    expect(await loadAdminScope(user.id, user.role)).toBeNull();
  });

  it("returns null for USER", async () => {
    const user = await createTestUser("USER");
    expect(await loadAdminScope(user.id, user.role)).toBeNull();
  });

  it("returns null for an ADMIN with zero AdminScope rows — the global-admin default", async () => {
    const user = await createTestUser("ADMIN");
    expect(await loadAdminScope(user.id, user.role)).toBeNull();
  });

  it("returns the correct teamIds/productIds Sets for a scoped ADMIN", async () => {
    const user = await createTestUser("ADMIN");
    const team = await makeTeam();
    const product = await makeProduct();
    await prisma.adminScope.create({ data: { userId: user.id, teamId: team.id, productId: null } });
    await prisma.adminScope.create({ data: { userId: user.id, teamId: null, productId: product.id } });

    const scope = await loadAdminScope(user.id, user.role);
    expect(scope).not.toBeNull();
    expect(scope!.teamIds.has(team.id)).toBe(true);
    expect(scope!.productIds.has(product.id)).toBe(true);
  });
});

describe("canManageTeamOrProducts", () => {
  it("null scope (unrestricted) is always true, regardless of args", () => {
    expect(canManageTeamOrProducts(null, "any-team-id", ["any-product-id"])).toBe(true);
    expect(canManageTeamOrProducts(null, null, [])).toBe(true);
  });

  it("scoped: true on a teamId match", () => {
    const scope = { teamIds: new Set(["team-1"]), productIds: new Set<string>() };
    expect(canManageTeamOrProducts(scope, "team-1", [])).toBe(true);
  });

  it("scoped: true on a productId intersection", () => {
    const scope = { teamIds: new Set<string>(), productIds: new Set(["prod-1"]) };
    expect(canManageTeamOrProducts(scope, null, ["prod-2", "prod-1"])).toBe(true);
  });

  it("scoped: false when neither team nor any product matches", () => {
    const scope = { teamIds: new Set(["team-1"]), productIds: new Set(["prod-1"]) };
    expect(canManageTeamOrProducts(scope, "team-2", ["prod-2"])).toBe(false);
  });
});

describe("getAdminsForTeamOrProducts", () => {
  it("always includes SUPER_ADMIN, regardless of any scope match", async () => {
    const superAdmin = await createTestUser("SUPER_ADMIN");
    const team = await makeTeam();
    const admins = await getAdminsForTeamOrProducts(team.id, []);
    expect(admins.map((a) => a.id)).toContain(superAdmin.id);
  });

  it("always includes a zero-scope (global) ADMIN", async () => {
    const globalAdmin = await createTestUser("ADMIN");
    const team = await makeTeam();
    const admins = await getAdminsForTeamOrProducts(team.id, []);
    expect(admins.map((a) => a.id)).toContain(globalAdmin.id);
  });

  it("only includes a scoped ADMIN when the team/product actually matches", async () => {
    const scopedAdmin = await createTestUser("ADMIN");
    const teamA = await makeTeam("Team A");
    const teamB = await makeTeam("Team B");
    await prisma.adminScope.create({ data: { userId: scopedAdmin.id, teamId: teamA.id } });

    const matching = await getAdminsForTeamOrProducts(teamA.id, []);
    expect(matching.map((a) => a.id)).toContain(scopedAdmin.id);

    const nonMatching = await getAdminsForTeamOrProducts(teamB.id, []);
    expect(nonMatching.map((a) => a.id)).not.toContain(scopedAdmin.id);
  });

  it("excludes an inactive admin even when their scope matches", async () => {
    const inactiveAdmin = await createTestUser("ADMIN", { active: false });
    const team = await makeTeam();
    await prisma.adminScope.create({ data: { userId: inactiveAdmin.id, teamId: team.id } });

    const admins = await getAdminsForTeamOrProducts(team.id, []);
    expect(admins.map((a) => a.id)).not.toContain(inactiveAdmin.id);
  });

  it("union is correct across multiple admins with different scopes", async () => {
    const superAdmin = await createTestUser("SUPER_ADMIN");
    const globalAdmin = await createTestUser("ADMIN");
    const matchingScoped = await createTestUser("ADMIN");
    const nonMatchingScoped = await createTestUser("ADMIN");
    const teamA = await makeTeam("Team A");
    const teamB = await makeTeam("Team B");
    await prisma.adminScope.create({ data: { userId: matchingScoped.id, teamId: teamA.id } });
    await prisma.adminScope.create({ data: { userId: nonMatchingScoped.id, teamId: teamB.id } });

    const ids = (await getAdminsForTeamOrProducts(teamA.id, [])).map((a) => a.id);
    expect(ids).toContain(superAdmin.id);
    expect(ids).toContain(globalAdmin.id);
    expect(ids).toContain(matchingScoped.id);
    expect(ids).not.toContain(nonMatchingScoped.id);
  });
});
