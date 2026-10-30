/** Records of an import a retry left alone, by reason. */
export interface RetrySkippedInterface {
  /** FAILED records with a PERMANENT failure, kept because the retry was not forced. */
  permanent: number;
  /** Records already CLASSIFIED; successful work is not repeated. */
  classified: number;
  /** Records waiting for review; a human decides them. */
  needsReview: number;
  /** Records still PENDING or PROCESSING, not counting the ones this retry just re-queued. */
  inProgress: number;
}
