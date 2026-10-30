import { IsDefined, IsNotEmpty, IsString, Matches, MaxLength } from "class-validator";
import { NO_CONTROL_CHARACTERS, RECORD_FIELD_LIMITS } from "../../constants/import-record.constant";
import { IsRecordDateDecorator } from "../../decorators/is-record-date.decorator";

/** One submitted record. Validated per item (see `record-validation.helper.ts`), never as a whole batch. */
export class ImportRecordDto {
  /** The record's id in its source system, for example `news-1001`; case-sensitive, no control characters. */
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(RECORD_FIELD_LIMITS.externalId)
  @Matches(NO_CONTROL_CHARACTERS)
  public externalId!: string;

  /** Title or activity name, for example `Municipality closes unlicensed factory`. */
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(RECORD_FIELD_LIMITS.title)
  public title!: string;

  /** Full text the classifier reads, for example `Inspection campaign found the factory operating without a licence.` */
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(RECORD_FIELD_LIMITS.description)
  public description!: string;

  /** Where the record came from, for example `gov-news`; compared case-insensitively after trimming. */
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(RECORD_FIELD_LIMITS.source)
  public source!: string;

  /** Publication or effective date, for example `2026-10-25`: `YYYY-MM-DD` or an ISO 8601 date-time with an offset. */
  @IsDefined()
  @IsString()
  @IsRecordDateDecorator()
  public date!: string;
}
