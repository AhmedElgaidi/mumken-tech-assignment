import { RecordStatusEnum } from "../../../modules/classification/contracts/enums/lifecycle/record-status.enum";
import { ImportItemOutcomeEnum } from "../../../modules/import/contracts/enums/import-item-outcome.enum";
import { ItemCountsType, RecordCountsType } from "../../../modules/import/contracts/types/import-count.type";

/** Zeroed count maps, so every outcome and status is always present in a response. */
export class ImportCountUtil {
  /**
   * Builds the per-outcome item counts, all zero.
   *
   * @returns A map with one `0` entry for every `ImportItemOutcomeEnum` value.
   */
  public static createEmptyItemCounts(): ItemCountsType {
    return Object.assign({}, ...Object.values(ImportItemOutcomeEnum).map((outcome) => ({ [outcome]: 0 })));
  }

  /**
   * Builds the per-status record counts, all zero.
   *
   * @returns A map with one `0` entry for every `RecordStatusEnum` value.
   */
  public static createEmptyRecordCounts(): RecordCountsType {
    return Object.assign({}, ...Object.values(RecordStatusEnum).map((status) => ({ [status]: 0 })));
  }
}
