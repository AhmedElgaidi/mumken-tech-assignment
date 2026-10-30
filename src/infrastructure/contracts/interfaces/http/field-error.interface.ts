import { FieldErrorCodeEnum } from "../../enums/http/field-error-code.enum";

/** One problem with one field, phrased so the client knows how to fix it. */
export interface FieldErrorInterface {
  /** Dotted path of the refused field (e.g. `records.0.title`). */
  field: string;
  /** Machine-readable reason the field was refused. */
  code: FieldErrorCodeEnum;
  /** Human-readable explanation of how to fix it. */
  message: string;
}
