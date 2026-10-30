/** Outcome of one submitted item. */
export enum ImportItemOutcomeEnum {
  /** Valid and stored as a new record. */
  ACCEPTED = "ACCEPTED",
  /** Failed validation; `errors` lists each field. */
  INVALID = "INVALID",
  /** Same source and external id as an earlier item in the same batch. */
  DUPLICATE_IN_BATCH = "DUPLICATE_IN_BATCH",
  /** Same source and external id as a record stored before. */
  DUPLICATE_EXISTING = "DUPLICATE_EXISTING",
}
