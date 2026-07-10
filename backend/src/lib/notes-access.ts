import { prisma } from "./prisma.js";
import { loadAdminScope, canManageTeamOrProducts } from "./admin-scope.js";

// Content access to a team note is gated purely by an explicit membership
// row on that specific note — no role-based bypass for anyone, not even
// Super Admin. Deliberate: an unrelated team's admin (or Super Admin) has no
// reason to see this note just by virtue of their role.
export async function isTeamNoteMember(userId: string, teamNoteId: string): Promise<boolean> {
  const row = await prisma.teamNoteMembership.findUnique({
    where: { userId_teamNoteId: { userId, teamNoteId } },
  });
  return row !== null;
}

// Curating a team note (creating one, or adding/removing members) is a
// separate permission from viewing content — gated by the same admin-scope
// rule used everywhere else (global Admin/Super Admin unrestricted, scoped
// Admin only for teams in their scope). Checked against the org Team a note
// belongs to, not the note itself — an admin who curates a team can create
// a note for it, but doesn't automatically become a member of every note
// that already exists there.
export async function canCurateTeamNotes(userId: string, role: string, teamId: string): Promise<boolean> {
  if (role !== "ADMIN" && role !== "SUPER_ADMIN") return false;
  const scope = await loadAdminScope(userId, role);
  return canManageTeamOrProducts(scope, teamId, []);
}
