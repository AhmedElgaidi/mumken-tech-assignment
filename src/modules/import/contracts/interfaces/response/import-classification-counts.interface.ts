/** Records of an import by classification status. */
export interface ImportClassificationCountsInterface {
  /** Records waiting for the classifier. */
  pending: number;
  /** Records being classified right now. */
  processing: number;
  /** Records classified without needing review. */
  classified: number;
  /** Records waiting for a human review. */
  needsReview: number;
  /** Records whose classification failed. */
  failed: number;
}
