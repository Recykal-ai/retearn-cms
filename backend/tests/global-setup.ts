import { config } from "dotenv";
import path from "node:path";
import { execSync } from "node:child_process";

// Runs ONCE for the whole test run, in its own separate process (Vitest's
// globalSetup contract) — does not share process.env with the actual
// test-file workers, so this needs its own env load (see setup-env.ts,
// which does the per-worker load that route/lib modules actually see).
export default function globalSetup(): void {
  config({ path: path.resolve(import.meta.dirname, "../.env.test"), override: true });

  // db push, not migrate deploy — prisma/migrations/ has no migration
  // subfolders (only migration_lock.toml), the dev DB itself was never run
  // through `prisma migrate dev`, so there's no migration history to
  // replay. --accept-data-loss is fine here: retearn_cms_test is a
  // disposable database reset every run, never a real one. Requires the
  // database to already exist — see .env.test's own comment for the
  // one-time `CREATE DATABASE` step. (Prisma 7 dropped --skip-generate.)
  execSync("npx prisma db push --accept-data-loss", {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: process.env,
    stdio: "inherit",
  });
}
