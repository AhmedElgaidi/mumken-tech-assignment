/** Maximum length per record field. */
export const RECORD_FIELD_LIMITS = {
  externalId: 255,
  title: 500,
  description: 5000,
  source: 100,
} as const;

/** Rejects tabs, new lines and other control characters in an external id. */
export const NO_CONTROL_CHARACTERS = /^[^\u0000-\u001f\u007f]*$/; // eslint-disable-line no-control-regex -- the point

/** The fields a record carries, in the order errors are reported. */
export const IMPORT_RECORD_FIELDS: readonly string[] = ["externalId", "title", "description", "source", "date"];

/** Field name used in an error about a submitted item that is not a JSON object. */
export const RECORD_ITEM_FIELD = "item";
