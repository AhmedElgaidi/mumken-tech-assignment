/** How the worker classifies records: concurrency, attempts, timing and the review threshold. */
export interface ClassificationSettingsInterface {
  /** Classification jobs the process runs at the same time. */
  concurrency: number;
  /** Classifier attempts per retry generation; the database `attemptCount` enforces it. */
  maxAttempts: number;
  /** First retry delay, in milliseconds; it doubles on each retry. */
  backoffMs: number;
  /** How long a claim owns a record, in milliseconds; must be longer than `classifierTimeoutMs`. */
  leaseMs: number;
  /** Longest one classifier call may take, in milliseconds. */
  classifierTimeoutMs: number;
  /** A confidence below this (0 to 1) sends the record to NEEDS_REVIEW. */
  reviewThreshold: number;
}
