import { registerDecorator, ValidationOptions } from "class-validator";
import { RECORD_DATE_FORMAT_CONSTRAINT, RECORD_DATE_RANGE_CONSTRAINT } from "../constants/record-date.constant";
import { RecordDateUtil } from "../utils/record-date.util";
import { FieldErrorCodeEnum } from "../../../infrastructure/contracts/enums/http/field-error-code.enum";

/**
 * A record date: a real ISO 8601 date or date-time with offset, between 1900-01-01 and the
 * maximum. Registers two constraints so a bad format and an out-of-range date are told apart;
 * a value that is not a string is left to `@IsString()`.
 *
 * @param options - Standard class-validator options.
 * @returns The property decorator.
 */
export function IsRecordDateDecorator(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: RECORD_DATE_FORMAT_CONSTRAINT,
      target: target.constructor,
      propertyName: String(propertyName),
      options,
      validator: {
        validate: (value: unknown) => typeof value !== "string" || !RecordDateUtil.isFormatError(value),
        defaultMessage: () =>
          "date must be an ISO 8601 date (2026-10-25) or a date-time with an offset (2026-10-25T09:00:00+03:00)",
      },
    });
    registerDecorator({
      name: RECORD_DATE_RANGE_CONSTRAINT,
      target: target.constructor,
      propertyName: String(propertyName),
      options,
      validator: {
        validate: (value: unknown) => {
          if (typeof value !== "string") {
            return true;
          }
          const result = RecordDateUtil.parse(value);
          return result.isOk || result.code !== FieldErrorCodeEnum.OUT_OF_RANGE;
        },
        defaultMessage: () => `date must be between 1900-01-01 and ${RecordDateUtil.getMaxDay()}`,
      },
    });
  };
}
