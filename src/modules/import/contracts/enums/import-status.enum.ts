/** Derived, live status of an import (see `ImportStatusUtil`). */
export enum ImportStatusEnum {
  /** At least one accepted record is still PENDING or PROCESSING. */
  PROCESSING = "PROCESSING",
  /** Nothing is in progress and there are no issues: no invalid items and no records in review or failed. Duplicates are not issues. */
  COMPLETED = "COMPLETED",
  /** Nothing is in progress, but some items were invalid, or some records need review or failed. */
  COMPLETED_WITH_ISSUES = "COMPLETED_WITH_ISSUES",
}
