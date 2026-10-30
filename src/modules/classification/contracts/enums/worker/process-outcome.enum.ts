/** What happened to a record when the worker handled its job. */
export enum ProcessOutcomeEnum {
  /** Classified with enough confidence. */
  CLASSIFIED = "classified",
  /** Classified, but a person must review it. */
  NEEDS_REVIEW = "needs-review",
  /** Nothing to do: the record is gone or already final. */
  SKIPPED = "skipped",
  /** Every attempt was used without a result; the record was marked failed. */
  EXHAUSTED = "exhausted",
  /** Another worker took the record over before this one could save. */
  LOST_LEASE = "lost-lease",
}
