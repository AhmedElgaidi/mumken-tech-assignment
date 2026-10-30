/**
 * Name of the unique index that forbids two imports sharing an idempotency key. The import
 * service catches a unique violation on this exact name to detect a racing duplicate request.
 */
export const IMPORT_IDEMPOTENCY_KEY_CONSTRAINT = "import_idempotency_key_uniq";

/**
 * Column widths of externally supplied text. They match `RECORD_FIELD_LIMITS` in the import
 * feature (the validation limits) and the `STRING(n)` widths in the migrations.
 */
export const SQL_COLUMN_LIMITS = {
  externalId: 255,
  title: 500,
  description: 5000,
  source: 100,
  idempotencyKey: 255,
} as const;

/** Connection pool and startup retry of the Sequelize connection. */
export const SQL_CONNECTION = {
  /** Most connections the pool opens. */
  POOL_MAX: 10,
  /** Connections the pool keeps open when idle. */
  POOL_MIN: 0,
  /** Milliseconds a query waits for a free connection before it fails. */
  POOL_ACQUIRE_MS: 10000,
  /** Milliseconds an idle connection lives before it is closed. */
  POOL_IDLE_MS: 10000,
  /** Connection attempts at startup before the process gives up. */
  RETRY_ATTEMPTS: 3,
  /** Milliseconds between startup connection attempts. */
  RETRY_DELAY_MS: 1000,
} as const;

/** Error message when a statement that must return a row, such as `INSERT … RETURNING`, returned none. */
export const MISSING_ROW_MESSAGE = "The statement returned no row";
