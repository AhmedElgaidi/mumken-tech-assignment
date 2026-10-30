import { IsNotEmpty, IsString, IsUUID, MaxLength } from "class-validator";
import { REVIEW_FIELD_LIMITS } from "../../constants/review-field.constant";

/** Body of an approval of the automatic classification. */
export class ApproveReviewDto {
  /** Name of the reviewer, for example `nada`; kept on the approval for audit. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(REVIEW_FIELD_LIMITS.reviewedBy)
  public reviewedBy!: string;

  /** The `currentClassificationId` the reviewer saw; the approval is refused if it changed (optimistic concurrency check). */
  @IsUUID()
  public expectedCurrentClassificationId!: string;
}
