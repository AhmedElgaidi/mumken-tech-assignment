import { plainToInstance } from "class-transformer";
import { validateSync, ValidationError } from "class-validator";
import { FieldErrorCodeEnum } from "../../../infrastructure/contracts/enums/http/field-error-code.enum";
import { ItemWarningCodeEnum } from "../contracts/enums/item-warning-code.enum";
import { FieldErrorInterface } from "../../../infrastructure/contracts/interfaces/http/field-error.interface";
import { ItemWarningInterface } from "../contracts/interfaces/item/item-warning.interface";
import { ImportRecordDto } from "../contracts/dtos/import-record.dto";
import { IMPORT_RECORD_FIELDS, RECORD_FIELD_LIMITS, RECORD_ITEM_FIELD } from "../constants/import-record.constant";
import { RECORD_DATE_FORMAT_CONSTRAINT, RECORD_DATE_RANGE_CONSTRAINT } from "../constants/record-date.constant";
import { RecordDateUtil } from "../utils/record-date.util";
import { RecordIdentityUtil } from "../utils/record-identity.util";
import { ItemValidationType } from "../contracts/types/item-validation.type";

/** Per-item validation with class-validator; one error per field, every field reported. */
export class RecordValidationHelper {
  /** Error code per class-validator constraint. */
  private static readonly CODE_BY_CONSTRAINT: Record<string, FieldErrorCodeEnum> = {
    isDefined: FieldErrorCodeEnum.REQUIRED,
    isString: FieldErrorCodeEnum.INVALID_TYPE,
    isNotEmpty: FieldErrorCodeEnum.EMPTY,
    matches: FieldErrorCodeEnum.INVALID_FORMAT,
    [RECORD_DATE_FORMAT_CONSTRAINT]: FieldErrorCodeEnum.INVALID_DATE,
    maxLength: FieldErrorCodeEnum.TOO_LONG,
    [RECORD_DATE_RANGE_CONSTRAINT]: FieldErrorCodeEnum.OUT_OF_RANGE,
  };

  /** Which code wins when a field fails several constraints: the most basic one first. */
  private static readonly PRIORITY: FieldErrorCodeEnum[] = [
    FieldErrorCodeEnum.REQUIRED,
    FieldErrorCodeEnum.INVALID_TYPE,
    FieldErrorCodeEnum.EMPTY,
    FieldErrorCodeEnum.INVALID_FORMAT,
    FieldErrorCodeEnum.INVALID_DATE,
    FieldErrorCodeEnum.TOO_LONG,
    FieldErrorCodeEnum.OUT_OF_RANGE,
  ];

  /**
   * Validates one submitted item on its own, so one bad item never fails the batch. Collects
   * every field error; unknown fields are ignored and reported as warnings. On a failing item
   * the echoed `externalId` and `source` are cut to their field limits so the stored row fits.
   *
   * Steps:
   * 1. Reject an item that is not a JSON object
   * 2. Normalise the strings and collect unknown-field warnings
   * 3. Validate the fields
   * 4. Parse the date
   * 5. Build the normalised record
   *
   * @param raw - One element of the submitted batch, of any type.
   * @returns A valid record with warnings, or the field errors of the item.
   */
  public static validate(raw: unknown): ItemValidationType {
    // 1. Reject an item that is not a JSON object
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return RecordValidationHelper.createNotObjectResult();
    }
    // 2. Normalise the strings and collect unknown-field warnings
    const normalized = RecordValidationHelper.normalize(raw as Record<string, unknown>);
    const warnings = RecordValidationHelper.listWarnings(normalized);
    // 3. Validate the fields
    const dto = plainToInstance(ImportRecordDto, normalized);
    const errors = validateSync(dto, { forbidUnknownValues: false });
    if (errors.length > 0) {
      return RecordValidationHelper.createInvalidResult(errors, warnings, normalized);
    }
    // 4. Parse the date
    const parsed = RecordDateUtil.parse(dto.date);
    if (!parsed.isOk) {
      throw new Error("unreachable: date passed validation but did not parse");
    }
    // 5. Build the normalised record
    return {
      isValid: true,
      warnings,
      record: {
        externalId: dto.externalId,
        title: dto.title,
        description: dto.description,
        source: dto.source,
        sourceKey: RecordIdentityUtil.getSourceKey(dto.source),
        recordDate: parsed.value,
        contentHash: RecordIdentityUtil.getContentHash(dto.title, dto.description, parsed.value),
      },
    };
  }

  private static createNotObjectResult(): ItemValidationType {
    return {
      isValid: false,
      errors: [
        {
          field: RECORD_ITEM_FIELD,
          code: FieldErrorCodeEnum.INVALID_ITEM,
          message: "each record must be a JSON object",
        },
      ],
      warnings: [],
      externalId: null,
      source: null,
    };
  }

  private static createInvalidResult(
    errors: ValidationError[],
    warnings: ItemWarningInterface[],
    normalized: Record<string, unknown>,
  ): ItemValidationType {
    return {
      isValid: false,
      errors: RecordValidationHelper.toFieldErrors(errors),
      warnings,
      externalId:
        typeof normalized.externalId === "string"
          ? normalized.externalId.slice(0, RECORD_FIELD_LIMITS.externalId)
          : null,
      source: typeof normalized.source === "string" ? normalized.source.slice(0, RECORD_FIELD_LIMITS.source) : null,
    };
  }

  private static listWarnings(normalized: Record<string, unknown>): ItemWarningInterface[] {
    return Object.keys(normalized)
      .filter((key) => !IMPORT_RECORD_FIELDS.includes(key))
      .map((field) => ({ code: ItemWarningCodeEnum.UNKNOWN_FIELD_IGNORED, field }));
  }

  private static messageFor(field: string, code: FieldErrorCodeEnum): string {
    switch (code) {
      case FieldErrorCodeEnum.REQUIRED:
        return `${field} is required`;
      case FieldErrorCodeEnum.INVALID_TYPE:
        return `${field} must be a string`;
      case FieldErrorCodeEnum.EMPTY:
        return `${field} must not be empty or only spaces`;
      case FieldErrorCodeEnum.INVALID_FORMAT:
        return `${field} must not contain control characters (tabs, new lines)`;
      case FieldErrorCodeEnum.TOO_LONG:
        return `${field} must be at most ${RECORD_FIELD_LIMITS[field as keyof typeof RECORD_FIELD_LIMITS]} characters`;
      case FieldErrorCodeEnum.INVALID_DATE:
        return "date must be a real ISO 8601 date (2026-10-25) or a date-time with an offset (2026-10-25T09:00:00+03:00)";
      case FieldErrorCodeEnum.OUT_OF_RANGE:
        return `date must be between 1900-01-01 and ${RecordDateUtil.getMaxDay()}`;
      case FieldErrorCodeEnum.INVALID_ITEM:
      case FieldErrorCodeEnum.UNKNOWN_FIELD:
      case FieldErrorCodeEnum.INVALID:
      default:
        return `${field} is invalid`;
    }
  }

  /** Trim + Unicode NFC on string values; other values are left for the validator to reject. */
  private static normalize(raw: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [
        key,
        typeof value === "string" ? value.normalize("NFC").trim() : value,
      ]),
    );
  }

  /** Keeps one error per field (the most basic one) so the client fixes the right thing first. */
  private static toFieldErrors(errors: ValidationError[]): FieldErrorInterface[] {
    return errors
      .map((error) => {
        const codes = Object.keys(error.constraints ?? {}).map(
          (name) => RecordValidationHelper.CODE_BY_CONSTRAINT[name] ?? FieldErrorCodeEnum.INVALID,
        );
        const code =
          [...codes].sort(
            (a, b) => RecordValidationHelper.PRIORITY.indexOf(a) - RecordValidationHelper.PRIORITY.indexOf(b),
          )[0] ?? FieldErrorCodeEnum.INVALID;
        return {
          field: error.property,
          code,
          message: RecordValidationHelper.messageFor(error.property, code),
        };
      })
      .sort((a, b) => IMPORT_RECORD_FIELDS.indexOf(a.field) - IMPORT_RECORD_FIELDS.indexOf(b.field));
  }
}
