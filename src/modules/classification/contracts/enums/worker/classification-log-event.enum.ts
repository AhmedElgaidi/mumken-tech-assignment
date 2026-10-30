/** Values of the `event` log field written by the classification worker and the sweeper. */
export enum ClassificationLogEventEnum {
  /** A worker claimed the record and calls the classifier. */
  STARTED = "classification.started",
  /** The classifier answered and the result was stored. */
  SUCCEEDED = "classification.succeeded",
  /** The job found nothing to do (record already settled or not claimable). */
  SKIPPED = "classification.skipped",
  /** A transient failure; BullMQ will run the job again after backoff. */
  RETRYING = "classification.retrying",
  /** The record ended FAILED (attempts used up or a permanent error). */
  FAILED = "classification.failed",
  /** The lease ran out or was taken over before the result could be written. */
  LOST_LEASE = "classification.lost-lease",
  /** The sweeper found a stuck record and queued it again. */
  SWEEPER_REQUEUED = "sweeper.requeued",
}
