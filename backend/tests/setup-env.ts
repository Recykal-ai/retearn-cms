import { config } from "dotenv";
import path from "node:path";

// Runs per test-file worker, BEFORE any src/ module is imported (Vitest's
// setupFiles contract) — src/lib/prisma.ts and src/lib/jwt.ts both read
// process.env at module-import time, not lazily, so this has to land first.
// override:true matters: a dev shell that already exported DATABASE_URL/
// JWT_SECRET (e.g. from this same terminal's earlier `npm run dev`) must
// not silently win over the test values.
config({ path: path.resolve(import.meta.dirname, "../.env.test"), override: true });
