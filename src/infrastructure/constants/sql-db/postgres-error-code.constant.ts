/** PostgreSQL SQLSTATE codes the service reacts to. */
export const POSTGRES_ERROR_CODE = {
  /** A unique index or constraint refused the row. */
  UNIQUE_VIOLATION: "23505",
  /** The database aborted this transaction to break a deadlock; safe to retry. */
  DEADLOCK_DETECTED: "40P01",
} as const;
