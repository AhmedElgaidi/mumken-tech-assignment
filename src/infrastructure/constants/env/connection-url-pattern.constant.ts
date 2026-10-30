/** A PostgreSQL connection URL starts with `postgres://` or `postgresql://`. */
export const POSTGRES_URL_PATTERN = new RegExp("^postgres(ql)?:/{2}");

/** A Redis connection URL starts with `redis://` or `rediss://` (TLS). */
export const REDIS_URL_PATTERN = new RegExp("^rediss?:/{2}");
