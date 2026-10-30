import { ImportItemOutcomeEnum } from "../../enums/import-item-outcome.enum";

/** An item matching a record that an earlier import stored. */
export interface DuplicateExistingItemInterface {
  /** Zero-based position of the item in the submitted batch. */
  index: number;
  /** Always `DUPLICATE_EXISTING`. */
  kind: ImportItemOutcomeEnum.DUPLICATE_EXISTING;
  /** The external id of the item. */
  externalId: string | null;
  /** Id of the stored record the item matches. */
  existingRecordId: string | null;
  /** True when the item's title, description or date differs from the stored record. */
  hasContentChanged: boolean;
}
