/** Connection limits of the Redis clients used by BullMQ. */
export const REDIS_CONNECTION = {
  /** How long the producer waits to connect, in milliseconds. */
  PRODUCER_CONNECT_TIMEOUT_MS: 2000,
  /** How often a producer command is retried before it fails; 1 keeps `add()` fast when Redis is down. */
  PRODUCER_MAX_RETRIES_PER_REQUEST: 1,
} as const;
