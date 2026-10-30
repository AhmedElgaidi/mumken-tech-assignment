import { FieldErrorCodeEnum } from "../../../../infrastructure/contracts/enums/http/field-error-code.enum";

/** Result of parsing a record date: the instant, or why the text was refused. */
export type RecordDateResultType =
  | { isOk: true; value: Date }
  | { isOk: false; code: FieldErrorCodeEnum.INVALID_DATE | FieldErrorCodeEnum.OUT_OF_RANGE };
