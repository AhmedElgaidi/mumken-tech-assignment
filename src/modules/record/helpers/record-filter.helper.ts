import { HttpStatus } from "@nestjs/common";
import { ErrorCodeEnum } from "../../../infrastructure/contracts/enums/http/error-code.enum";
import { ProblemException } from "../../../infrastructure/exceptions/http/problem.exception";
import { RECORD_STATUSES } from "../../classification/constants/lifecycle/classification.constant";
import { RecordStatusEnum } from "../../classification/contracts/enums/lifecycle/record-status.enum";
import { MS_PER_DAY } from "../../import/constants/record-date.constant";
import { RecordDateUtil } from "../../import/utils/record-date.util";
import { LIKE_ESCAPE_PATTERN } from "../constants/record-query.constant";
import { ListRecordQueryDto } from "../contracts/dtos/list-record-query.dto";
import { RecordDateRangeType } from "../contracts/types/record-date-range.type";

/** Parses the plain-text list filters into the values the repository understands, failing on the first bad one. */
export class RecordFilterHelper {
  /**
   * Builds the error returned for a filter the list cannot use.
   *
   * @param detail - What is wrong with the filter.
   * @returns A `400 INVALID_FILTER` exception.
   */
  public static createInvalidFilterException(detail: string): ProblemException {
    return new ProblemException(HttpStatus.BAD_REQUEST, ErrorCodeEnum.INVALID_FILTER, detail);
  }

  /**
   * Splits a comma-separated status list and checks every status.
   *
   * Steps:
   * 1. Split and normalise the statuses.
   * 2. Find the statuses that are not known.
   * 3. Fail when any status is unknown.
   * 4. Return the statuses.
   *
   * @param statusText - The comma-separated statuses sent by the caller.
   * @returns The upper-case statuses.
   * @throws ProblemException `INVALID_FILTER` for an unknown status.
   */
  public static parseStatuses(statusText: string): RecordStatusEnum[] {
    // 1. Split and normalise the statuses.
    const statuses = statusText.split(",").map((part) => part.trim().toUpperCase());

    // 2. Find the statuses that are not known.
    const unknownStatuses = statuses.filter((status) => !RECORD_STATUSES.includes(status as RecordStatusEnum));

    // 3. Fail when any status is unknown.
    if (unknownStatuses.length > 0) {
      throw RecordFilterHelper.createInvalidFilterException(
        `Unknown status ${unknownStatuses.join(", ")}; allowed: ${RECORD_STATUSES.join(", ")}`,
      );
    }

    // 4. Return the statuses.
    return statuses as RecordStatusEnum[];
  }

  /**
   * Turns the date filters into a range. A date-only `dateTo` includes its whole day, so it
   * becomes an exclusive bound a day later.
   *
   * Steps:
   * 1. Parse both dates.
   * 2. Fail when the range is reversed.
   * 3. Return the bounds the caller sent.
   *
   * @param query - The list query.
   * @returns The date bounds the caller sent.
   * @throws ProblemException `INVALID_FILTER` for a bad date or a reversed range.
   */
  public static parseDateRange(query: ListRecordQueryDto): RecordDateRangeType {
    // 1. Parse both dates.
    const dateFrom =
      query.dateFrom === undefined ? undefined : RecordFilterHelper.parseDate("dateFrom", query.dateFrom);
    const dateTo = query.dateTo === undefined ? undefined : RecordFilterHelper.parseDate("dateTo", query.dateTo);

    // 2. Fail when the range is reversed.
    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw RecordFilterHelper.createInvalidFilterException("dateFrom must not be after dateTo");
    }

    // 3. Return the bounds the caller sent.
    return {
      ...(dateFrom && { dateFrom }),
      ...RecordFilterHelper.toUpperBound(dateTo, query.dateTo),
    };
  }

  /**
   * Builds the escaped `ILIKE` pattern that finds a text anywhere in a title.
   *
   * Steps:
   * 1. Trim the text.
   * 2. Return nothing when it is blank.
   * 3. Escape the LIKE characters and wrap the text in wildcards.
   *
   * @param searchText - The text sent by the caller.
   * @returns The pattern, or `undefined` when the text is blank.
   */
  public static toTitlePattern(searchText: string): string | undefined {
    // 1. Trim the text.
    const trimmedText = searchText.trim();

    // 2. Return nothing when it is blank.
    if (trimmedText === "") {
      return undefined;
    }

    // 3. Escape the LIKE characters and wrap the text in wildcards.
    return `%${trimmedText.replace(LIKE_ESCAPE_PATTERN, (character) => `\\${character}`)}%`;
  }

  /**
   * Picks the upper date bound: a date-only value is exclusive a day later, a date-time is inclusive.
   *
   * @param dateTo - The parsed upper date, when sent.
   * @param dateToText - The upper date as the caller wrote it.
   * @returns The upper bound, or nothing when no upper date was sent.
   */
  private static toUpperBound(dateTo: Date | undefined, dateToText: string | undefined): RecordDateRangeType {
    if (!dateTo || dateToText === undefined) {
      return {};
    }
    return RecordDateUtil.isDateOnly(dateToText.trim())
      ? { dateToExclusive: new Date(dateTo.getTime() + MS_PER_DAY) }
      : { dateToInclusive: dateTo };
  }

  /**
   * Parses one ISO 8601 filter date.
   *
   * Steps:
   * 1. Parse the trimmed value.
   * 2. Fail when it is not a valid date.
   * 3. Return the date.
   *
   * @param fieldName - The filter name, used in the error message.
   * @param dateText - The date sent by the caller.
   * @returns The parsed date.
   * @throws ProblemException `INVALID_FILTER` for a bad date.
   */
  private static parseDate(fieldName: string, dateText: string): Date {
    // 1. Parse the trimmed value.
    const parsedDate = RecordDateUtil.parseIso(dateText.trim());

    // 2. Fail when it is not a valid date.
    if (!parsedDate) {
      throw RecordFilterHelper.createInvalidFilterException(
        `${fieldName} must be an ISO 8601 date (2026-10-25) or a date-time with an offset`,
      );
    }

    // 3. Return the date.
    return parsedDate;
  }
}
