/** Records of an import that a retry left alone, counted by why. */
export interface RecoveryRemainingInterface {
  /** FAILED with a PERMANENT failure; requeued only with `isForced`. */
  permanent: number;
  /** Already CLASSIFIED. */
  classified: number;
  /** Waiting in NEEDS_REVIEW. */
  needsReview: number;
  /** PENDING or PROCESSING right now. */
  inProgress: number;
}
