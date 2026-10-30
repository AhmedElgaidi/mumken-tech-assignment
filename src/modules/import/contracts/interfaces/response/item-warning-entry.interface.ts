import { ItemWarningInterface } from "../item/item-warning.interface";

/** A warning of one accepted item, tagged with the item's position. */
export interface ItemWarningEntryInterface extends ItemWarningInterface {
  /** Zero-based position of the item in the submitted batch. */
  index: number;
}
