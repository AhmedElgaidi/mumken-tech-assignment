/**
 * BullMQ job options of one classification job. The database `attemptCount` is the real
 * attempt limit; BullMQ's own limit sits above it as a safety net.
 */
export const CLASSIFICATION_JOB_OPTION = {
  /** Extra BullMQ attempts above `CLASSIFICATION_MAX_ATTEMPTS`. */
  ATTEMPTS_SAFETY_MARGIN: 2,
  /** BullMQ backoff strategy between attempts. */
  BACKOFF_TYPE: "exponential",
  /** How long a failed job stays in Redis for inspection, in seconds (one day). */
  FAILED_RETENTION_SECONDS: 86_400,
} as const;
