/**
 * Upper bounds, in milliseconds, on every Redis call of the producer. A dead Redis must
 * never hang an HTTP request or block shutdown.
 */
export const QUEUE_PRODUCER_TIMEOUT_MS = {
  /** Adding a batch of jobs to a queue. */
  ENQUEUE: 3000,
  /** The Redis liveness ping used by the health check. */
  PING: 1000,
  /** Closing the queues on shutdown. */
  CLOSE: 2000,
} as const;
