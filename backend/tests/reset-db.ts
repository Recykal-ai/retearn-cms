import { prisma } from "../src/lib/prisma.js";

// Children-before-parents order, derived directly from prisma/schema.prisma's
// FK graph (cross-check against that file when a new model is added — this
// list needs a new entry, in the right position, or resetDb will start
// failing with an FK-violation error rather than silently doing the wrong
// thing). Self-referential tables (PersonalNoteFolder, TeamNoteFolder,
// TeamNoteComment all have a parentId pointing at their own table) are safe
// as a single DELETE FROM — Postgres removes every row in one statement, so
// there's no "delete children before parent" ordering problem *within* one
// table, only *between* tables.
const TABLES_CHILD_TO_PARENT = [
  "GoogleOAuthToken",
  "AuditLog",
  "PinnedDocument",
  "DocumentProduct",
  "DocumentCategory",
  "DocumentVersion",
  "Notification",
  "TeamNoteActivity",
  "TeamNoteComment",
  "TeamNoteMembership",
  "PersonalNote",
  "TeamNote",
  "PersonalNoteFolder",
  "TeamNoteFolder",
  "Document",
  "AdminScope",
  "Category",
  "Product",
  "Team",
  "User",
];

// Run in beforeEach (not afterEach) — guarantees a clean slate regardless of
// how the previous test exited, including a crashed process that skipped
// its own cleanup.
export async function resetDb(): Promise<void> {
  for (const table of TABLES_CHILD_TO_PARENT) {
    await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`);
  }
}
