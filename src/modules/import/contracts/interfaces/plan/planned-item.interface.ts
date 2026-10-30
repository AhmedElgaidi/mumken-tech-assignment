import { ImportItemOutcomeEnum } from "../../enums/import-item-outcome.enum";
import { ItemValidationType } from "../../types/item-validation.type";

/** One submitted item after validation and in-batch duplicate detection. */
export interface PlannedItemInterface {
  /** Zero-based position of the item in the submitted batch. */
  index: number;
  /** The validation result of the item. */
  validation: ItemValidationType;
  /** `INVALID`, `DUPLICATE_IN_BATCH`, or `null` while the database decides ACCEPTED vs DUPLICATE_EXISTING. */
  outcome: ImportItemOutcomeEnum.INVALID | ImportItemOutcomeEnum.DUPLICATE_IN_BATCH | null;
  /** Position of the first occurrence when `outcome` is `DUPLICATE_IN_BATCH`; otherwise `null`. */
  duplicateOfIndex: number | null;
}
