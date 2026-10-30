import { ImportStatusEnum } from "../../enums/import-status.enum";
import { DuplicateItemType } from "../../types/duplicate-item.type";
import { ImportLinksInterface } from "./import-links.interface";
import { ImportSummaryInterface } from "./import-summary.interface";
import { InvalidItemInterface } from "./invalid-item.interface";
import { ItemWarningEntryInterface } from "./item-warning-entry.interface";

/** The body of a submit: the same shape for the first call and for every replay. */
export interface SubmitImportResponseInterface {
  /** Public id of the import (its `publicId`), the same `id` that `GET /imports/:id` returns. */
  id: string;
  /** Live status at the time of the response. */
  status: ImportStatusEnum;
  /** Item counts by outcome. */
  summary: ImportSummaryInterface;
  /** Items that failed validation. */
  invalidItems: InvalidItemInterface[];
  /** Items that duplicate another item or an existing record. */
  duplicateItems: DuplicateItemType[];
  /** Warnings of accepted items. */
  warnings: ItemWarningEntryInterface[];
  /** Paths to follow the import. */
  links: ImportLinksInterface;
}
