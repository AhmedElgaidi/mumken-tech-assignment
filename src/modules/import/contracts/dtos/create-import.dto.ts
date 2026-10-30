import { ArrayMinSize, IsArray, IsDefined } from "class-validator";

/**
 * The batch envelope. Only the envelope is validated here; each item is validated on its own
 * by the service, so invalid items are reported without failing the valid ones.
 */
export class CreateImportDto {
  /** The submitted items: 1 to IMPORT_MAX_RECORDS entries, each checked on its own as an `ImportRecordDto`. */
  @IsDefined()
  @IsArray()
  @ArrayMinSize(1)
  public records!: unknown[];
}
