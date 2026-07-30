import { prisma } from "../../src/lib/prisma.js";
import { signAppJwt } from "../../src/lib/jwt.js";
import type { Role } from "../../src/generated/prisma/enums.js";

export interface TestUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
}

// Mirrors scripts/dev-token.ts's exact pattern (a real User row, then
// signAppJwt({ userId, role })) — no real Google OAuth needed anywhere in
// tests. Fresh disposable users per call rather than one fixed seeded email,
// since resetDb() wipes User between every test anyway.
let counter = 0;

export async function createTestUser(
  role: Role = "USER",
  overrides: Partial<{ name: string; email: string; active: boolean }> = {},
): Promise<TestUser> {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: overrides.email ?? `test-user-${counter}@recykal.com`,
      name: overrides.name ?? `Test User ${counter}`,
      role,
      active: overrides.active ?? true,
    },
  });
  return user;
}

export function authHeaderFor(user: Pick<TestUser, "id" | "role">): Record<string, string> {
  const token = signAppJwt({ userId: user.id, role: user.role });
  return { Authorization: `Bearer ${token}` };
}
