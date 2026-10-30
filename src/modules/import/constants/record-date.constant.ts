/** Earliest accepted record date: 1900-01-01 00:00 UTC. */
export const MIN_RECORD_DATE = new Date(Date.UTC(1900, 0, 1));

/** Years past "now" a record date may lie: room for scheduled dates, yet a typo such as year 2206 is refused. */
export const MAX_FUTURE_YEARS = 5;

/** Milliseconds in one day; a date-only upper bound includes its whole day. */
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Length of the `YYYY-MM-DD` prefix of an ISO 8601 string. */
export const ISO_DATE_LENGTH = 10;

/** Months in a calendar year; the upper bound of a date's month part. */
export const MONTHS_PER_YEAR = 12;

/** Highest value of each time part of a date-time, and of its UTC offset (offset hours go up to +14). */
export const RECORD_TIME_BOUNDS = {
  hour: 23,
  minute: 59,
  second: 59,
  offsetHours: 14,
  offsetMinutes: 59,
} as const;

/** class-validator constraint name of the date format check; the validation helper maps it to a field error code. */
export const RECORD_DATE_FORMAT_CONSTRAINT = "isRecordDateFormat";

/** class-validator constraint name of the date range check; the validation helper maps it to a field error code. */
export const RECORD_DATE_RANGE_CONSTRAINT = "isRecordDateInRange";
