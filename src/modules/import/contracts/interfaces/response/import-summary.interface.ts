/** How many submitted items ended in each outcome. */
export interface ImportSummaryInterface {
  /** Items in the batch. */
  total: number;
  /** Items stored as new records. */
  accepted: number;
  /** Items that failed validation. */
  invalid: number;
  /** Items repeating an earlier item of the same batch. */
  duplicateInBatch: number;
  /** Items matching a record stored by an earlier import. */
  duplicateExisting: number;
}
