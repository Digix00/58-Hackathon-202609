import path from "node:path";

import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      // Keep Workers AI remote calls out of the test runtime.
      wrangler: { configPath: "./wrangler.test.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(
            path.resolve(process.cwd(), "migrations"),
          ),
        },
      },
    })),
  ],
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
  },
});
