import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Stage 2 — Automated tests.
// Tests live in the top-level `tests/` module (never under any service `src/`),
// so production builds (`tsc -b`) never see them. Vitest runs the TypeScript
// sources directly via esbuild, so no build step is required before testing.
export default defineConfig({
  resolve: {
    alias: {
      // Run tests against package source, mirroring the dev path alias in
      // services/*/tsconfig.dev.json — no need to `tsc -b` the package first.
      "@csat/shared": resolve(__dirname, "packages/shared/src/index.ts"),
      "@csat/http": resolve(__dirname, "packages/http/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // Mongo connect (esp. a remote Infisical-supplied URI) can exceed the 10s
    // default for beforeAll/afterAll.
    hookTimeout: 30000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["packages/*/src/**", "services/*/src/**"],
      exclude: ["**/dist/**", "**/*.test.ts", "**/index.ts"],
      // Warn-only for now: coverage is reported but does not fail the build.
      // Flip to a hard gate once meaningful tests exist by uncommenting:
      // thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
