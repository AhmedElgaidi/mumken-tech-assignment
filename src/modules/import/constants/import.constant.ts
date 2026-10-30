import { ImportItemOutcomeEnum } from "../contracts/enums/import-item-outcome.enum";

/** Every item outcome, used to validate the `outcome` filter of the items list. */
export const IMPORT_ITEM_OUTCOMES: readonly ImportItemOutcomeEnum[] = Object.values(ImportItemOutcomeEnum);
/** Longest accepted `Idempotency-Key` header, in characters (the column is `VARCHAR(255)`). */
export const IDEMPOTENCY_KEY_MAX_LENGTH = 255;
/** Rows per multi-row INSERT, to keep statements and bind lists small. */
export const INSERT_CHUNK_SIZE = 250;
