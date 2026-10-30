/** Every action that moves a record between classification statuses. */
export enum RecordTriggerEnum {
  /** A worker takes a PENDING record (PENDING to PROCESSING). */
  CLAIM = "CLAIM",
  /** A worker takes a PROCESSING record whose lease ran out. */
  RECLAIM_EXPIRED_LEASE = "RECLAIM_EXPIRED_LEASE",
  /** A claim finds no attempts left and no valid lease, so the record goes to FAILED at once. */
  EXHAUST_ON_CLAIM = "EXHAUST_ON_CLAIM",
  /** A confident result (to CLASSIFIED). */
  SUCCEED = "SUCCEED",
  /** A low-confidence or unknown-category result (to NEEDS_REVIEW). */
  SUCCEED_LOW_CONFIDENCE = "SUCCEED_LOW_CONFIDENCE",
  /** A transient failure with attempts left (back to PENDING). */
  FAIL_RETRYABLE = "FAIL_RETRYABLE",
  /** A transient failure with no attempts left (to FAILED, TRANSIENT_EXHAUSTED). */
  FAIL_EXHAUSTED = "FAIL_EXHAUSTED",
  /** A permanent failure (to FAILED, PERMANENT). */
  FAIL_PERMANENT = "FAIL_PERMANENT",
  /** A recovery request puts a FAILED record back to PENDING. */
  RETRY = "RETRY",
  /** A reviewer accepts the automatic result (NEEDS_REVIEW to CLASSIFIED). */
  APPROVE = "APPROVE",
  /** A reviewer sets a different category on a NEEDS_REVIEW or CLASSIFIED record (to CLASSIFIED). */
  CORRECT = "CORRECT",
  /** A person classifies a FAILED record by hand (to CLASSIFIED). */
  CLASSIFY_MANUALLY = "CLASSIFY_MANUALLY",
}
