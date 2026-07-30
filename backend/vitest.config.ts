import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup-env.ts", "./tests/setup-db.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
    // Every vi.fn() (notifyDocumentPending etc.) is created once at module
    // scope via vi.mock — without this, call history accumulates across
    // every test in the file instead of resetting per-test.
    clearMocks: true,
    pool: "forks",
    // resetDb() truncates shared tables in the same test database — a
    // serial run avoids two test files racing on that state.
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
  },
});
