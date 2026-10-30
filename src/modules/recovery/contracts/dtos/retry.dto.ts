import { IsBoolean, IsOptional } from "class-validator";

/** Body of a retry call. */
export class RetryDto {
  /** Also retry PERMANENT failures, which usually fail again; defaults to false. */
  @IsOptional()
  @IsBoolean()
  public isForced: boolean = false;
}
