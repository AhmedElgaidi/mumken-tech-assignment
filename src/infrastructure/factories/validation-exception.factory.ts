import { HttpStatus } from "@nestjs/common";
import { ValidationError } from "class-validator";
import { ErrorCodeEnum } from "../contracts/enums/http/error-code.enum";
import { FieldErrorCodeEnum } from "../contracts/enums/http/field-error-code.enum";
import { FieldErrorInterface } from "../contracts/interfaces/http/field-error.interface";
import { ProblemException } from "../exceptions/http/problem.exception";

/** Turns class-validator failures into one 400 problem+json with a per-field error list. */
export class ValidationExceptionFactory {
  /** Field error code for each class-validator constraint; anything unlisted is `INVALID`. */
  private static readonly FIELD_ERROR_CODE_BY_CONSTRAINT: Record<string, FieldErrorCodeEnum> = {
    isDefined: FieldErrorCodeEnum.REQUIRED,
    isNotEmpty: FieldErrorCodeEnum.REQUIRED,
    isString: FieldErrorCodeEnum.INVALID_TYPE,
    isBoolean: FieldErrorCodeEnum.INVALID_TYPE,
    isArray: FieldErrorCodeEnum.INVALID_TYPE,
    isUuid: FieldErrorCodeEnum.INVALID_FORMAT,
    maxLength: FieldErrorCodeEnum.TOO_LONG,
    minLength: FieldErrorCodeEnum.EMPTY,
    arrayMinSize: FieldErrorCodeEnum.EMPTY,
    whitelistValidation: FieldErrorCodeEnum.UNKNOWN_FIELD,
  };

  /**
   * Turns nested class-validator failures into one flat list of field errors.
   *
   * @param errors - The failures at this level.
   * @param parentPath - The dotted path of the parent field, empty at the top level.
   * @returns One entry per violated constraint, with the full dotted field path.
   */
  private static flattenFieldErrors(errors: ValidationError[], parentPath = ""): FieldErrorInterface[] {
    return errors.flatMap((error) => {
      const field = parentPath ? `${parentPath}.${error.property}` : error.property;
      const own = Object.entries(error.constraints ?? {}).map(([constraint, message]) => ({
        field,
        code: ValidationExceptionFactory.FIELD_ERROR_CODE_BY_CONSTRAINT[constraint] ?? FieldErrorCodeEnum.INVALID,
        message,
      }));
      return [...own, ...ValidationExceptionFactory.flattenFieldErrors(error.children ?? [], field)];
    });
  }

  /**
   * Global ValidationPipe hook.
   *
   * @param errors - The failures class-validator collected.
   * @returns A 400 problem+json exception with `errors: [{field, code, message}]`.
   */
  public static create(errors: ValidationError[]): ProblemException {
    return new ProblemException(
      HttpStatus.BAD_REQUEST,
      ErrorCodeEnum.VALIDATION_FAILED,
      "The request body is invalid",
      {
        errors: ValidationExceptionFactory.flattenFieldErrors(errors),
      },
    );
  }
}
