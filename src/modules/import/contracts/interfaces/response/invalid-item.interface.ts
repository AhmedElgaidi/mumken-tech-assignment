import { FieldErrorInterface } from "../../../../../infrastructure/contracts/interfaces/http/field-error.interface";

/** One item that failed validation, as shown in a submit response. */
export interface InvalidItemInterface {
  /** Zero-based position of the item in the submitted batch. */
  index: number;
  /** The external id the item sent; `null` when it sent none. */
  externalId: string | null;
  /** One error per failing field. */
  errors: FieldErrorInterface[];
}
