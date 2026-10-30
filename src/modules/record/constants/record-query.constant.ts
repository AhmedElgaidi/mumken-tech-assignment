import { RECORD_FIELD_LIMITS } from "../../import/constants/import-record.constant";

/** Records returned per page when the caller sends no `limit`. */
export const DEFAULT_RECORD_PAGE_SIZE = 20;

/** Largest `limit` a caller may ask for on the record list. */
export const MAX_RECORD_PAGE_SIZE = 100;

/** Maximum length of the list filters that take free text. */
export const RECORD_QUERY_LIMITS = {
  source: RECORD_FIELD_LIMITS.source,
  q: 200,
} as const;

/** Characters of the filter hash kept in a cursor; enough to tell two filter sets apart. */
export const CURSOR_FILTER_HASH_LENGTH = 16;

/** Shape of a UUID: 36 hex digits and dashes. */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Characters that mean something to SQL LIKE; each is escaped with a backslash. */
export const LIKE_ESCAPE_PATTERN = /[\\%_]/g;
