import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { RedisContainer, StartedRedisContainer } from "@testcontainers/redis";

import { execFileSync } from "node:child_process";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..");

declare global {
  var testContainers: { postgres: StartedPostgreSqlContainer; redis: StartedRedisContainer } | undefined;
}

/**
 * Starts one PostgreSQL and one Redis for the whole run and migrates the schema with the same `sequelize-cli` command compose runs.
 *
 * Steps:
 * 1. Start PostgreSQL and Redis together.
 * 2. Keep the containers for the teardown.
 * 3. Point the environment at them.
 * 4. Migrate the schema.
 */
export default async function globalSetup(): Promise<void> {
  // 1. Start PostgreSQL and Redis together.
  const [postgres, redis] = await Promise.all([
    new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("ingestion")
      .withUsername("app")
      .withPassword("app")
      .start(),
    new RedisContainer("redis:7-alpine").start(),
  ]);

  // 2. Keep the containers for the teardown.
  globalThis.testContainers = { postgres, redis };

  // 3. Point the environment at them.
  process.env.DATABASE_URL = postgres.getConnectionUri();
  process.env.REDIS_URL = redis.getConnectionUrl();

  // 4. Migrate the schema.
  execFileSync(join(REPO_ROOT, "node_modules", ".bin", "sequelize-cli"), ["db:migrate"], {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    stdio: "pipe",
  });
}
