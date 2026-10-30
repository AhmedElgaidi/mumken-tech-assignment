/** Keys and limits of the readiness probe. */
export const HEALTH_CHECK = {
  /** Key of the database indicator in the readiness report. */
  DATABASE_KEY: "database",
  /** Key of the Redis indicator in the readiness report. */
  REDIS_KEY: "redis",
  /** How long the database ping may take before readiness fails, in milliseconds. */
  DATABASE_TIMEOUT_MS: 2000,
} as const;
