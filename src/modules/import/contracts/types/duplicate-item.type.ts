import { DuplicateExistingItemInterface } from "../interfaces/response/duplicate-existing-item.interface";
import { DuplicateInBatchItemInterface } from "../interfaces/response/duplicate-in-batch-item.interface";

/** One duplicate item in a submit response, told apart by its `kind`. */
export type DuplicateItemType = DuplicateExistingItemInterface | DuplicateInBatchItemInterface;
