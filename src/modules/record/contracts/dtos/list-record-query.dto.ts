import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import { MAX_RECORD_PAGE_SIZE, RECORD_QUERY_LIMITS } from "../../constants/record-query.constant";

/** Query of the record list: filters and keyset paging. A cursor is bound to the filters it was issued for. */
export class ListRecordQueryDto {
  /** Source to keep; matches case-insensitively after trimming. */
  @IsOptional()
  @IsString()
  @MaxLength(RECORD_QUERY_LIMITS.source)
  public source?: string;

  /** Current category code to keep (see GET /categories). */
  @IsOptional()
  @IsString()
  public category?: string;

  /** Comma-separated statuses to keep: PENDING, PROCESSING, CLASSIFIED, NEEDS_REVIEW, FAILED; NEEDS_REVIEW is the review queue. */
  @IsOptional()
  @IsString()
  public status?: string;

  /** Earliest record date, inclusive, for example `2026-10-01`; same formats as a record date. */
  @IsOptional()
  @IsString()
  public dateFrom?: string;

  /** Latest record date, inclusive, for example `2026-10-31`; a date-only value includes that whole day (UTC). */
  @IsOptional()
  @IsString()
  public dateTo?: string;

  /** Keep only records created by this import. */
  @IsOptional()
  @IsUUID()
  public importId?: string;

  /** Text the title must contain, case-insensitive. */
  @IsOptional()
  @IsString()
  @MaxLength(RECORD_QUERY_LIMITS.q)
  public q?: string;

  /** Opaque cursor from the previous page's `nextCursor`; omitted starts at the first record. */
  @IsOptional()
  @IsString()
  public cursor?: string;

  /** Records per page, from 1 to `MAX_RECORD_PAGE_SIZE`; defaults to `DEFAULT_RECORD_PAGE_SIZE`. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_RECORD_PAGE_SIZE)
  public limit?: number;
}
