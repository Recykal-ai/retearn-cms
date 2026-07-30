import { beforeEach } from "vitest";
import { resetDb } from "./reset-db.js";

// Global — every test file gets a clean DB automatically, without each one
// remembering to import/call resetDb itself.
beforeEach(async () => {
  await resetDb();
});
