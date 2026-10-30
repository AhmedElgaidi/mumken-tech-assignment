import { ImportStatusEnum } from "../contracts/enums/import-status.enum";
import { PERCENT_COMPLETE } from "../constants/import-progress.constant";
import { ImportProgressInterface } from "../contracts/interfaces/status/import-progress.interface";
import { ImportStatusInputInterface } from "../contracts/interfaces/status/import-status-input.interface";

/** Derives an import's live status; nothing about it is stored. */
export class ImportStatusUtil {
  /**
   * Derives the live status of an import from its items and the records it created (truth table
   * in docs/ARCHITECTURE.md). Duplicates are not issues: re-sending known data is normal.
   *
   * Steps:
   * 1. Count the records by stage.
   * 2. Work out the progress.
   * 3. Find out whether any item or record has an issue.
   * 4. Return COMPLETED for an import that created no records.
   * 5. Return PROCESSING while records are in flight.
   * 6. Return the final status.
   *
   * @param input - Item counts, record counts and the two timestamps the status needs.
   * @returns The status, the completion time (`null` while records are in flight) and progress.
   */
  public static derive(input: ImportStatusInputInterface): ImportProgressInterface {
    // 1. Count the records by stage.
    const { items, records } = input;
    const created = Object.values(records).reduce((sum, count) => sum + count, 0);
    const inFlight = records.PENDING + records.PROCESSING;
    const finished = records.CLASSIFIED + records.NEEDS_REVIEW + records.FAILED;

    // 2. Work out the progress.
    const percent = created === 0 ? PERCENT_COMPLETE : Math.floor((finished / created) * PERCENT_COMPLETE);
    const progress = { finished, of: created, percent };

    // 3. Find out whether any item or record has an issue.
    const hasIssues = items.INVALID > 0 || records.FAILED > 0 || records.NEEDS_REVIEW > 0;

    // 4. Return COMPLETED for an import that created no records.
    if (created === 0) {
      return {
        status: items.INVALID > 0 ? ImportStatusEnum.COMPLETED_WITH_ISSUES : ImportStatusEnum.COMPLETED,
        completedAt: input.createdAt,
        progress,
      };
    }

    // 5. Return PROCESSING while records are in flight.
    if (inFlight > 0) {
      return { status: ImportStatusEnum.PROCESSING, completedAt: null, progress };
    }

    // 6. Return the final status.
    return {
      status: hasIssues ? ImportStatusEnum.COMPLETED_WITH_ISSUES : ImportStatusEnum.COMPLETED,
      completedAt: input.latestFinishedAt,
      progress,
    };
  }
}
