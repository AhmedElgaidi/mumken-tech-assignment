import { HttpStatus, Injectable } from "@nestjs/common";
import { ErrorCodeEnum } from "../../../infrastructure/contracts/enums/http/error-code.enum";
import { ServiceResultInterface } from "../../../infrastructure/contracts/interfaces/http/service-result.interface";
import { ProblemException } from "../../../infrastructure/exceptions/http/problem.exception";
import { ReviewRepository } from "../../../infrastructure/repositories/classification/review.repository";
import { TransactionHelper } from "../../../infrastructure/helpers/sql-db/transaction.helper";
import { CategoryService } from "../../category/services/category.service";
import { RecordDetailInterface } from "../../record/contracts/interfaces/record-detail.interface";
import { ApproveReviewDto } from "../contracts/dtos/approve-review.dto";
import { CorrectClassificationDto } from "../contracts/dtos/correct-classification.dto";
import { ReviewApprovalService } from "./review-approval.service";
import { ReviewCorrectionService } from "./review-correction.service";

/**
 * Human review. Classifications are append-only: approving or correcting inserts a new row
 * that supersedes the current one; the automatic original stays visible. Each action locks the
 * record row, checks the classification the reviewer saw, and is safe to repeat.
 */
@Injectable()
export class ReviewService {
  public constructor(
    private readonly reviewRepository: ReviewRepository,
    private readonly reviewApprovalService: ReviewApprovalService,
    private readonly reviewCorrectionService: ReviewCorrectionService,
    private readonly categoryService: CategoryService,
  ) {}

  /**
   * Accepts the automatic result of a NEEDS_REVIEW record. A repeat of the same approval answers
   * 200 with the record instead of failing, so a client may retry safely; a new approval answers 201.
   *
   * Steps:
   * 1. Open the transaction.
   * 2. Run the approval and commit.
   * 3. Roll back and rethrow when the approval fails.
   *
   * @param recordId - The record to approve.
   * @param dto - The reviewer and the classification id they saw.
   * @returns The record, flagged `isCreated` when this call stored a new approval.
   * @throws ProblemException `NOT_FOUND`, `NOT_IN_REVIEW` or `STALE_CLASSIFICATION`.
   */
  public async approve(
    recordId: string,
    dto: ApproveReviewDto,
  ): Promise<ServiceResultInterface<RecordDetailInterface>> {
    // 1. Open the transaction.
    const transaction = await this.reviewRepository.createTransaction();
    try {
      // 2. Run the approval and commit.
      const result = await this.reviewApprovalService.approve(recordId, dto, transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      // 3. Roll back and rethrow when the approval fails.
      await TransactionHelper.rollbackQuietly(transaction);
      throw error;
    }
  }

  /**
   * Corrects the category of a NEEDS_REVIEW or CLASSIFIED record, or classifies a FAILED record
   * by hand (expected id `null`). A repeat of the same correction answers 200 instead of 201.
   *
   * Steps:
   * 1. Check the category exists
   * 2. Open the transaction
   * 3. Run the correction and commit
   * 4. Roll back and rethrow when the correction fails
   *
   * @param recordId - The record to correct.
   * @param dto - The new category, reason, reviewer and the classification id they saw.
   * @returns The record, flagged `isCreated` when this call stored a new correction.
   * @throws ProblemException `UNKNOWN_CATEGORY`, `NOT_FOUND`, `CLASSIFICATION_IN_PROGRESS`, `STALE_CLASSIFICATION` or `SAME_CATEGORY`.
   */
  public async correct(
    recordId: string,
    dto: CorrectClassificationDto,
  ): Promise<ServiceResultInterface<RecordDetailInterface>> {
    // 1. Check the category exists
    const categoryCode = await this.resolveCategoryCode(dto.categoryCode);

    // 2. Open the transaction
    const transaction = await this.reviewRepository.createTransaction();
    try {
      // 3. Run the correction and commit
      const result = await this.reviewCorrectionService.correct(recordId, dto, categoryCode, transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      // 4. Roll back and rethrow when the correction fails
      await TransactionHelper.rollbackQuietly(transaction);
      throw error;
    }
  }

  /**
   * Normalises the category the reviewer chose and checks it is a known code.
   *
   * Steps:
   * 1. Normalise the category code.
   * 2. Fail when the code is unknown.
   * 3. Return the normalised code.
   *
   * @param categoryText - The category as the reviewer sent it.
   * @returns The lower-case category code.
   * @throws ProblemException `UNKNOWN_CATEGORY` for an unknown category.
   */
  private async resolveCategoryCode(categoryText: string): Promise<string> {
    // 1. Normalise the category code.
    const categoryCode = categoryText.trim().toLowerCase();

    // 2. Fail when the code is unknown.
    if (!(await this.categoryService.getCodes()).has(categoryCode)) {
      throw new ProblemException(
        HttpStatus.BAD_REQUEST,
        ErrorCodeEnum.UNKNOWN_CATEGORY,
        `Unknown category "${categoryText}"; see GET /categories`,
      );
    }

    // 3. Return the normalised code.
    return categoryCode;
  }
}
