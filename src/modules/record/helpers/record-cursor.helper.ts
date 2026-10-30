import { HttpStatus } from "@nestjs/common";
import { CursorUtil } from "../../../infrastructure/utils/http/cursor.util";
import { ErrorCodeEnum } from "../../../infrastructure/contracts/enums/http/error-code.enum";
import { ProblemException } from "../../../infrastructure/exceptions/http/problem.exception";
import { UUID_PATTERN } from "../constants/record-query.constant";
import { RecordCursorInterface } from "../contracts/interfaces/record-cursor.interface";

/** Encodes and decodes the cursor of the record list; a cursor is bound to the filters it was issued for. */
export class RecordCursorHelper {
  /**
   * Encodes the position after the last record of a page.
   *
   * @param position - The date and id of the last record.
   * @param filterHash - The hash of the filters of the list.
   * @returns The opaque cursor.
   */
  public static encode(position: RecordCursorInterface, filterHash: string): string {
    return CursorUtil.encode({ recordDate: position.recordDate.toISOString(), id: position.id, filterHash });
  }

  /**
   * Decodes a cursor and checks it belongs to the current filters.
   *
   * Steps:
   * 1. Decode the cursor.
   * 2. Read the position it carries.
   * 3. Fail when the cursor was issued for other filters.
   * 4. Return the position to read after.
   *
   * @param cursor - The cursor sent by the caller.
   * @param filterHash - The hash of the current filters.
   * @returns The date and id to read after.
   * @throws ProblemException `INVALID_FILTER` for a malformed cursor, `INVALID_CURSOR` for a cursor from other filters.
   */
  public static decode(cursor: string, filterHash: string): RecordCursorInterface {
    // 1. Decode the cursor.
    const payload = CursorUtil.decode(cursor);
    if (!payload) {
      throw RecordCursorHelper.createMalformedException();
    }

    // 2. Read the position it carries.
    const recordDate = typeof payload.recordDate === "string" ? new Date(payload.recordDate) : null;
    const recordId = payload.id;
    if (
      !recordDate ||
      Number.isNaN(recordDate.getTime()) ||
      typeof recordId !== "string" ||
      !UUID_PATTERN.test(recordId)
    ) {
      throw RecordCursorHelper.createMalformedException();
    }

    // 3. Fail when the cursor was issued for other filters.
    if (payload.filterHash !== filterHash) {
      throw new ProblemException(
        HttpStatus.BAD_REQUEST,
        ErrorCodeEnum.INVALID_CURSOR,
        "cursor was issued for different filters; restart without a cursor",
      );
    }

    // 4. Return the position to read after.
    return { recordDate, id: recordId };
  }

  /**
   * Builds the error returned for a cursor that cannot be read.
   *
   * @returns A `400 INVALID_FILTER` exception.
   */
  private static createMalformedException(): ProblemException {
    return new ProblemException(
      HttpStatus.BAD_REQUEST,
      ErrorCodeEnum.INVALID_FILTER,
      "cursor is malformed; use the nextCursor value returned by the previous page",
    );
  }
}
