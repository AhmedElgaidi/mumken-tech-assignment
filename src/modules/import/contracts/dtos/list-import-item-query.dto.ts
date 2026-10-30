import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { MAX_IMPORT_ITEM_PAGE_SIZE } from "../../constants/import-query.constant";

/** Query of the import item list: an optional outcome filter and keyset paging. */
export class ListImportItemQueryDto {
  /** Comma-separated outcomes to keep: ACCEPTED, INVALID, DUPLICATE_IN_BATCH, DUPLICATE_EXISTING; omitted keeps all. */
  @IsOptional()
  @IsString()
  public outcome?: string;

  /** Opaque cursor from the previous page's `nextCursor`; omitted starts at the first item. */
  @IsOptional()
  @IsString()
  public cursor?: string;

  /** Items per page, from 1 to `MAX_IMPORT_ITEM_PAGE_SIZE`; defaults to `DEFAULT_IMPORT_ITEM_PAGE_SIZE`. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_IMPORT_ITEM_PAGE_SIZE)
  public limit?: number;
}
