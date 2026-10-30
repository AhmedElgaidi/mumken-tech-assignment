/** Why one field of a submitted record was refused; listed from most to least basic. */
export enum FieldErrorCodeEnum {
  /** The field is missing. */
  REQUIRED = "REQUIRED",
  /** The field is not a string. */
  INVALID_TYPE = "INVALID_TYPE",
  /** The field is empty or only spaces. */
  EMPTY = "EMPTY",
  /** The field holds control characters (tabs, new lines). */
  INVALID_FORMAT = "INVALID_FORMAT",
  /** The date is not a real ISO 8601 date or date-time with an offset. */
  INVALID_DATE = "INVALID_DATE",
  /** The field is longer than its limit. */
  TOO_LONG = "TOO_LONG",
  /** The date is outside the accepted range. */
  OUT_OF_RANGE = "OUT_OF_RANGE",
  /** The item itself is not a JSON object. */
  INVALID_ITEM = "INVALID_ITEM",
  /** The item carries a field the service does not accept. */
  UNKNOWN_FIELD = "UNKNOWN_FIELD",
  /** Any other refusal. */
  INVALID = "INVALID",
}
