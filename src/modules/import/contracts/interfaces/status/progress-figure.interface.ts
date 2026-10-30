/** How far the classification of an import's records has got. */
export interface ProgressFigureInterface {
  /** Records that reached CLASSIFIED, NEEDS_REVIEW or FAILED. */
  finished: number;
  /** Records the import created. */
  of: number;
  /** `finished` as a whole percent of `of`; 100 when the import created none. */
  percent: number;
}
