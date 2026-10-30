import { FieldErrorInterface } from "../../../../infrastructure/contracts/interfaces/http/field-error.interface";
import { ItemWarningInterface } from "../interfaces/item/item-warning.interface";
import { ValidRecordInterface } from "../interfaces/item/valid-record.interface";

/**
 * Result of validating one submitted item: a normalised record, or its field errors. On the
 * invalid branch `externalId` and `source` echo what the item sent (cut to the field limit),
 * or `null` when the item sent no string for them.
 */
export type ItemValidationType =
  | { isValid: true; record: ValidRecordInterface; warnings: ItemWarningInterface[] }
  | {
      isValid: false;
      errors: FieldErrorInterface[];
      warnings: ItemWarningInterface[];
      externalId: string | null;
      source: string | null;
    };
