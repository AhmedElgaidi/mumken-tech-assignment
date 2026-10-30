import { HttpStatus } from "@nestjs/common";
import { CursorUtil } from "../../../infrastructure/utils/http/cursor.util";
import { ErrorCodeEnum } from "../../../infrastructure/contracts/enums/http/error-code.enum";
import { ProblemException } from "../../../infrastructure/exceptions/http/problem.exception";
import { MAX_ITEM_CURSOR_INDEX } from "../constants/import-query.constant";
import { IMPORT_ITEM_OUTCOMES } from "../constants/import.constant";
import { ImportItemOutcomeEnum } from "../contracts/enums/import-item-outcome.enum";

/** Reads the `outcome` filter and the `cursor` of the import items list, rejecting bad input. */
export class ImportItemQueryHelper {
  /**
   * Read the item index out of a page cursor.
   *
   * Steps:
   * 1. Decode the cursor.
   * 2. Reject a malformed cursor.
   * 3. Return the index.
   *
   * @param cursor - The cursor from the previous page.
   * @returns The index of the last item of the previous page.
   * @throws ProblemException `INVALID_CURSOR` when the cursor is malformed.
   */
  public static decodeCursor(cursor: string): number {
    // 1. Decode the cursor.
    const decoded = CursorUtil.decode(cursor);

    // 2. Reject a malformed cursor.
    const isValidIndex =
      decoded !== null &&
      typeof decoded.index === "number" &&
      Number.isInteger(decoded.index) &&
      decoded.index >= 0 &&
      decoded.index <= MAX_ITEM_CURSOR_INDEX;
    if (!isValidIndex) {
      throw new ProblemException(
        HttpStatus.BAD_REQUEST,
        ErrorCodeEnum.INVALID_CURSOR,
        "cursor is malformed; use the nextCursor value returned by the previous page",
      );
    }

    // 3. Return the index.
    return decoded.index as number;
  }

  /**
   * Parse the comma separated outcome filter.
   *
   * Steps:
   * 1. Split the filter text into outcomes.
   * 2. Find the unknown outcomes.
   * 3. Reject the filter when any outcome is unknown.
   * 4. Return the outcomes.
   *
   * @param filterText - The filter text, such as `INVALID,ACCEPTED`.
   * @returns The outcomes in the filter.
   * @throws ProblemException `INVALID_FILTER` when an outcome is unknown.
   */
  public static parseOutcomes(filterText: string): ImportItemOutcomeEnum[] {
    // 1. Split the filter text into outcomes.
    const outcomes = filterText.split(",").map((part) => part.trim().toUpperCase());

    // 2. Find the unknown outcomes.
    const unknownOutcomes = outcomes.filter(
      (outcome) => !IMPORT_ITEM_OUTCOMES.includes(outcome as ImportItemOutcomeEnum),
    );

    // 3. Reject the filter when any outcome is unknown.
    if (unknownOutcomes.length > 0) {
      throw new ProblemException(
        HttpStatus.BAD_REQUEST,
        ErrorCodeEnum.INVALID_FILTER,
        `Unknown outcome ${unknownOutcomes.join(", ")}; allowed: ${IMPORT_ITEM_OUTCOMES.join(", ")}`,
      );
    }

    // 4. Return the outcomes.
    return outcomes as ImportItemOutcomeEnum[];
  }
}
