import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll } from "vitest";

type TestEnv = typeof env & {
  TEST_MIGRATIONS: Array<{ name: string; queries: string[] }>;
};

beforeAll(async () => {
  await applyD1Migrations(env.DB, (env as TestEnv).TEST_MIGRATIONS);
});
