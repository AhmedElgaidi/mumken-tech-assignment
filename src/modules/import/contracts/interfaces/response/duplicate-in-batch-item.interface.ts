import { ImportItemOutcomeEnum } from "../../enums/import-item-outcome.enum";

/** An item repeating an earlier item of the same batch. */
export interface DuplicateInBatchItemInterface {
  /** Zero-based position of the item in the submitted batch. */
  index: number;
  /** Always `DUPLICATE_IN_BATCH`. */
  kind: ImportItemOutcomeEnum.DUPLICATE_IN_BATCH;
  /** The external id of the item. */
  externalId: string | null;
  /** Position of the first occurrence in the batch. */
  duplicateOfIndex: number | null;
}
