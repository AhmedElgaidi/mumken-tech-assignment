/** Outcome of one automatic classification attempt. */
export enum AttemptOutcomeEnum {
  /** The classifier answered. */
  SUCCEEDED = "SUCCEEDED",
  /** A temporary failure (timeout, outage); the attempt may be repeated. */
  TRANSIENT_ERROR = "TRANSIENT_ERROR",
  /** The classifier refused the record; repeating will not help. */
  PERMANENT_ERROR = "PERMANENT_ERROR",
  /** An unexpected error; treated like a transient one. */
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}
