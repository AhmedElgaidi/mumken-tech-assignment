import { FieldErrorCodeEnum } from "../../../infrastructure/contracts/enums/http/field-error-code.enum";
import { RecordDateResultType } from "../contracts/types/record-date-result.type";
import {
  ISO_DATE_LENGTH,
  MAX_FUTURE_YEARS,
  MIN_RECORD_DATE,
  MONTHS_PER_YEAR,
  RECORD_TIME_BOUNDS,
} from "../constants/record-date.constant";

/** Parsing and range rules for the date of a record. */
export class RecordDateUtil {
  private static readonly DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

  private static readonly DATE_TIME =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-](\d{2}):(\d{2}))$/;

  /**
   * The latest accepted record date.
   *
   * Steps:
   * 1. Copy the reference instant.
   * 2. Add the future years.
   * 3. Return the latest date.
   *
   * @param now - The reference instant.
   * @returns `now` plus `MAX_FUTURE_YEARS` years.
   */
  public static getMax(now: Date): Date {
    // 1. Copy the reference instant.
    const max = new Date(now.getTime());

    // 2. Add the future years.
    max.setUTCFullYear(max.getUTCFullYear() + MAX_FUTURE_YEARS);

    // 3. Return the latest date.
    return max;
  }

  /**
   * The latest accepted record date as a `YYYY-MM-DD` day, for error messages.
   *
   * @param now - The reference instant; defaults to the current time.
   * @returns The day of `getMax(now)` in UTC.
   */
  public static getMaxDay(now: Date = new Date()): string {
    return RecordDateUtil.getMax(now).toISOString().slice(0, ISO_DATE_LENGTH);
  }

  /**
   * Parses a publication or effective date. Accepts `YYYY-MM-DD` (read as 00:00 UTC) or an
   * ISO 8601 date-time WITH an offset; a date-time without one is ambiguous and rejected.
   * Impossible calendar dates (`2026-02-30`) are rejected rather than rolled over.
   *
   * Steps:
   * 1. Parse the ISO text.
   * 2. Refuse text that is not a real date.
   * 3. Refuse a date outside the range.
   * 4. Return the instant.
   *
   * @param value - The submitted date text.
   * @param now - The reference instant for the upper bound; defaults to the current time.
   * @returns The instant, or `INVALID_DATE` / `OUT_OF_RANGE` when it is refused.
   */
  public static parse(value: string, now: Date = new Date()): RecordDateResultType {
    // 1. Parse the ISO text.
    const parsed = RecordDateUtil.parseIso(value);

    // 2. Refuse text that is not a real date.
    if (!parsed) {
      return { isOk: false, code: FieldErrorCodeEnum.INVALID_DATE };
    }

    // 3. Refuse a date outside the range.
    if (parsed < MIN_RECORD_DATE || parsed > RecordDateUtil.getMax(now)) {
      return { isOk: false, code: FieldErrorCodeEnum.OUT_OF_RANGE };
    }

    // 4. Return the instant.
    return { isOk: true, value: parsed };
  }

  /**
   * The format half of `parse`, without the range check (used by list filters).
   *
   * Steps:
   * 1. Match the text against the date and date-time formats.
   * 2. Return null when nothing matches.
   * 3. Return null for an impossible calendar date.
   * 4. Return null for a time of day out of bounds.
   * 5. Build the instant and return it.
   *
   * @param value - The date text, already trimmed.
   * @returns The instant, or `null` when the text is not a real ISO 8601 date or date-time with an offset.
   */
  public static parseIso(value: string): Date | null {
    // 1. Match the text against the date and date-time formats.
    const dateOnly = RecordDateUtil.DATE_ONLY.exec(value);
    const dateTime = dateOnly ? null : RecordDateUtil.DATE_TIME.exec(value);
    const match = dateOnly ?? dateTime;

    // 2. Return null when nothing matches.
    if (!match) {
      return null;
    }

    // 3. Return null for an impossible calendar date.
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (!RecordDateUtil.isRealCalendarDate(year, month, day)) {
      return null;
    }

    // 4. Return null for a time of day out of bounds.
    if (dateTime && !RecordDateUtil.isTimeInBounds(dateTime)) {
      return null;
    }

    // 5. Build the instant and return it.
    const parsed = dateOnly ? new Date(Date.UTC(year, month - 1, day)) : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  /**
   * Whether the text is a bare `YYYY-MM-DD` day, which a range filter reads as the whole day.
   *
   * @param value - The date text, already trimmed.
   * @returns True for the date-only form.
   */
  public static isDateOnly(value: string): boolean {
    return RecordDateUtil.DATE_ONLY.test(value);
  }

  /**
   * Whether the text fails the format check (the range is not looked at).
   *
   * @param value - The submitted date text.
   * @returns True when the text is not a real ISO 8601 date or date-time with an offset.
   */
  public static isFormatError(value: string): boolean {
    const result = RecordDateUtil.parse(value);
    return !result.isOk && result.code === FieldErrorCodeEnum.INVALID_DATE;
  }

  /**
   * Whether the time of day and the offset of a matched date-time are in range.
   *
   * Steps:
   * 1. Read the time parts.
   * 2. Read the offset parts.
   * 3. Compare each part with its bound.
   *
   * @param dateTime - The match of the date-time pattern.
   * @returns True when every part is within its bound.
   */
  private static isTimeInBounds(dateTime: RegExpExecArray): boolean {
    // 1. Read the time parts.
    const [hour, minute, second] = [Number(dateTime[4]), Number(dateTime[5]), Number(dateTime[6] ?? 0)];

    // 2. Read the offset parts.
    const offsetHours = dateTime[9] === undefined ? 0 : Number(dateTime[9]);
    const offsetMinutes = dateTime[10] === undefined ? 0 : Number(dateTime[10]);

    // 3. Compare each part with its bound.
    return (
      hour <= RECORD_TIME_BOUNDS.hour &&
      minute <= RECORD_TIME_BOUNDS.minute &&
      second <= RECORD_TIME_BOUNDS.second &&
      offsetHours <= RECORD_TIME_BOUNDS.offsetHours &&
      offsetMinutes <= RECORD_TIME_BOUNDS.offsetMinutes
    );
  }

  /**
   * Whether the year, month and day name a real calendar day.
   *
   * Steps:
   * 1. Reject an impossible month or day.
   * 2. Build the date from the parts.
   * 3. Compare the parts with the built date.
   *
   * @param year - The year.
   * @param month - The month, 1 to 12.
   * @param day - The day of the month.
   * @returns True when the date does not roll over.
   */
  private static isRealCalendarDate(year: number, month: number, day: number): boolean {
    // 1. Reject an impossible month or day.
    if (month < 1 || month > MONTHS_PER_YEAR || day < 1) {
      return false;
    }

    // 2. Build the date from the parts.
    const probe = new Date(Date.UTC(year, month - 1, day));

    // 3. Compare the parts with the built date.
    return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
  }
}
