import { IsNotEmpty, IsString, IsUUID, MaxLength, ValidateIf } from "class-validator";
import { REVIEW_FIELD_LIMITS } from "../../constants/review-field.constant";

/** Body of a manual correction, or of a manual classification of a FAILED record. */
export class CorrectClassificationDto {
  /** The category to assign, a code from GET /categories, for example `health`. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(REVIEW_FIELD_LIMITS.categoryCode)
  public categoryCode!: string;

  /** Why the reviewer chose it, for example `About food-safety inspections`. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(REVIEW_FIELD_LIMITS.reason)
  public reason!: string;

  /** Name of the reviewer, for example `nada`; kept on the correction for audit. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(REVIEW_FIELD_LIMITS.reviewedBy)
  public reviewedBy!: string;

  /** The `currentClassificationId` the reviewer saw; `null` when classifying a FAILED record that has none. */
  @ValidateIf((dto: CorrectClassificationDto) => dto.expectedCurrentClassificationId !== null)
  @IsUUID()
  public expectedCurrentClassificationId!: string | null;
}
