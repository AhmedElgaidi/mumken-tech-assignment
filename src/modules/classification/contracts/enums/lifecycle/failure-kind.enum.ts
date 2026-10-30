/** Why a record is FAILED; decides whether a retry may pick it up. */
export enum FailureKindEnum {
  /** Every attempt failed with a temporary error; an import or record retry picks it up. */
  TRANSIENT_EXHAUSTED = "TRANSIENT_EXHAUSTED",
  /** The classifier refused the record; only a forced retry or a manual classification moves it. */
  PERMANENT = "PERMANENT",
}
