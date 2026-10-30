import { ImportItemOutcomeEnum } from "../../../../../modules/import/contracts/enums/import-item-outcome.enum";
import { FieldErrorInterface } from "../../http/field-error.interface";
import { ItemWarningInterface } from "../../../../../modules/import/contracts/interfaces/item/item-warning.interface";
import { ItemCountsType, RecordCountsType } from "../../../../../modules/import/contracts/types/import-count.type";

/** A stored import as repositories return it. */
export interface ImportRowInterface {
  /** Public id of the import. */
  id: string;
  /** The client's idempotency key, when one was sent. */
  idempotencyKey: string | null;
  /** SHA-256 hex of the request records. */
  requestHash: string | null;
  /** How many items the request carried. */
  totalItems: number;
  /** When the import was created. */
  createdAt: Date;
}

/** The identity of a stored record, as the import needs it. */
export interface StoredKeyInterface {
  /** Public id of the record. */
  id: string;
  /** Lowercased, trimmed source name. */
  sourceKey: string;
  /** The source system's id for the record. */
  externalId: string;
  /** SHA-256 hex of the record content. */
  contentHash: string;
}

/** One item verdict of an import. */
export interface ImportItemRowInterface {
  /** Zero-based position in the request. */
  index: number;
  /** What the import did with the item. */
  outcome: ImportItemOutcomeEnum;
  /** External id echoed from the request. */
  externalId: string | null;
  /** Source name echoed from the request. */
  source: string | null;
  /** Validation errors of an INVALID item. */
  errors: FieldErrorInterface[] | null;
  /** Non-blocking warnings. */
  warnings: ItemWarningInterface[] | null;
  /** Public id of the record the item created or matched. */
  recordId: string | null;
  /** For an in-batch duplicate: the index of the earlier item. */
  duplicateOfIndex: number | null;
  /** For an existing duplicate: whether the content changed. */
  hasContentChanged: boolean | null;
}

/** The live counts of an import. */
export interface ImportCountsInterface {
  /** Items by outcome. */
  items: ItemCountsType;
  /** Records by classification status. */
  records: RecordCountsType;
  /** When the last record of the import finished; null while none has. */
  latestFinishedAt: Date | null;
}
