/** Classification status of a record. The allowed moves live in `RECORD_TRANSITIONS`. */
export enum RecordStatusEnum {
  /** Stored and waiting for a worker. */
  PENDING = "PENDING",
  /** A worker holds the lease and is classifying it. */
  PROCESSING = "PROCESSING",
  /** Has a confident automatic result or a manual decision. */
  CLASSIFIED = "CLASSIFIED",
  /** Has a result that a person must approve or correct (low confidence or unknown category). */
  NEEDS_REVIEW = "NEEDS_REVIEW",
  /** Classification stopped; `failureKind` says whether a retry may pick it up. */
  FAILED = "FAILED",
}
