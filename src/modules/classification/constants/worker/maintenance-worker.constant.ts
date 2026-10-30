/** Settings of the maintenance worker that runs the sweeper. */
export const MAINTENANCE_WORKER = {
  /** Name of the repeatable job scheduler on the maintenance queue. */
  SCHEDULER_ID: "sweeper",
  /** Sweeper passes never overlap, so the worker runs one job at a time. */
  CONCURRENCY: 1,
  /** How many failed sweep jobs stay in Redis for inspection. */
  FAILED_JOB_RETENTION_COUNT: 100,
} as const;
