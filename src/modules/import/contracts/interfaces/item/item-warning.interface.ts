import { ItemWarningCodeEnum } from "../../enums/item-warning-code.enum";

/** A non-blocking note about one submitted item. */
export interface ItemWarningInterface {
  /** Machine-readable kind of the note. */
  code: ItemWarningCodeEnum;
  /** The field the note is about. */
  field: string;
}
