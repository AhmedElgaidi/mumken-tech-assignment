/** Machine-readable codes carried in `code` of every problem+json response. */
export enum ErrorCodeEnum {
  /** The request body or parameters failed validation. */
  VALIDATION_FAILED = "VALIDATION_FAILED",
  /** The body is not valid JSON. */
  MALFORMED_JSON = "MALFORMED_JSON",
  /** The body is over the size limit. */
  PAYLOAD_TOO_LARGE = "PAYLOAD_TOO_LARGE",
  /** The body is not `application/json`. */
  UNSUPPORTED_MEDIA_TYPE = "UNSUPPORTED_MEDIA_TYPE",
  /** The batch has more records than allowed. */
  TOO_MANY_RECORDS = "TOO_MANY_RECORDS",
  /** The `Idempotency-Key` header is empty, too long or has bad characters. */
  INVALID_IDEMPOTENCY_KEY = "INVALID_IDEMPOTENCY_KEY",
  /** The key was already used with a different body. */
  IDEMPOTENCY_KEY_REUSED = "IDEMPOTENCY_KEY_REUSED",
  /** A list filter has a bad value. */
  INVALID_FILTER = "INVALID_FILTER",
  /** The cursor is broken or belongs to other filters. */
  INVALID_CURSOR = "INVALID_CURSOR",
  /** No resource has this id. */
  NOT_FOUND = "NOT_FOUND",
  /** The category code is not in the allowed list. */
  UNKNOWN_CATEGORY = "UNKNOWN_CATEGORY",
  /** A correction must choose a category different from the current one; use approve to keep it. */
  SAME_CATEGORY = "SAME_CATEGORY",
  /** A worker is classifying the record now; try again later. */
  CLASSIFICATION_IN_PROGRESS = "CLASSIFICATION_IN_PROGRESS",
  /** The record changed since the client read it (optimistic check failed). */
  STALE_CLASSIFICATION = "STALE_CLASSIFICATION",
  /** Approve needs a record in NEEDS_REVIEW. */
  NOT_IN_REVIEW = "NOT_IN_REVIEW",
  /** The record is CLASSIFIED or NEEDS_REVIEW, so a retry has nothing to do. */
  NOTHING_TO_RECOVER = "NOTHING_TO_RECOVER",
  /** The record failed permanently; retry it with `isForced: true` or classify it by hand. */
  PERMANENT_FAILURE = "PERMANENT_FAILURE",
  /** The API key is missing or wrong. */
  UNAUTHORIZED = "UNAUTHORIZED",
  /** PostgreSQL could not be reached. */
  DATABASE_UNAVAILABLE = "DATABASE_UNAVAILABLE",
  /** An unexpected server error. */
  INTERNAL_ERROR = "INTERNAL_ERROR",
}
