import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { JsonContentTypeGuard } from "../../../infrastructure/guards/json-content-type.guard";
import { ServiceResultInterface } from "../../../infrastructure/contracts/interfaces/http/service-result.interface";
import { RecordDetailInterface } from "../../record/contracts/interfaces/record-detail.interface";
import { ApproveReviewDto } from "../contracts/dtos/approve-review.dto";
import { CorrectClassificationDto } from "../contracts/dtos/correct-classification.dto";
import { ReviewService } from "../services/review.service";

/**
 * Human review of records: approve or correct a classification.
 *
 * @route /records/:id (api)
 */
@Controller("records/:id")
@UseGuards(JsonContentTypeGuard)
export class ReviewController {
  public constructor(private readonly reviewService: ReviewService) {}

  /**
   * Approve the current classification. Answers 201 when a MANUAL_APPROVAL row was appended,
   * 200 when already approved. Conflicts: NOT_IN_REVIEW, STALE_CLASSIFICATION.
   *
   * @route POST /records/:id/review/approve
   *
   * @param id - The record's public id.
   * @param body - The classification being approved.
   * @returns The record after the approval, flagged `isCreated` when a row was appended.
   */
  @Post("review/approve")
  @HttpCode(HttpStatus.OK)
  public async approveReview(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ApproveReviewDto,
  ): Promise<ServiceResultInterface<RecordDetailInterface>> {
    return this.reviewService.approve(id, body);
  }

  /**
   * Replace the classification by hand, or classify a FAILED record. Answers 201 when a
   * MANUAL_CORRECTION row was appended, 200 when the same correction was already applied.
   * Conflicts: CLASSIFICATION_IN_PROGRESS, STALE_CLASSIFICATION; 400 UNKNOWN_CATEGORY,
   * 422 SAME_CATEGORY.
   *
   * @route POST /records/:id/classifications
   *
   * @param id - The record's public id.
   * @param body - The new category, the reviewer and the classification id they saw.
   * @returns The record after the correction, flagged `isCreated` when a row was appended.
   */
  @Post("classifications")
  @HttpCode(HttpStatus.OK)
  public async correctClassification(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: CorrectClassificationDto,
  ): Promise<ServiceResultInterface<RecordDetailInterface>> {
    return this.reviewService.correct(id, body);
  }
}
