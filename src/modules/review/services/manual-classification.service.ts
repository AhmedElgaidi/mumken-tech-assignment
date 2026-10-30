import { HttpStatus, Injectable } from "@nestjs/common";
import { Transaction } from "sequelize";
import { ErrorCodeEnum } from "../../../infrastructure/contracts/enums/http/error-code.enum";
import { ProblemException } from "../../../infrastructure/exceptions/http/problem.exception";
import { ReviewRepository } from "../../../infrastructure/repositories/classification/review.repository";
import { ManualClassificationInterface } from "../contracts/interfaces/manual-classification.interface";

/** Stores a reviewer's classification and points the record at it. */
@Injectable()
export class ManualClassificationService {
  public constructor(private readonly reviewRepository: ReviewRepository) {}

  /**
   * Inserts the manual classification, then points the record at it. The update checks the
   * classification the reviewer saw, and it cannot miss while the row lock is held; the check
   * stays so the update never overwrites blindly.
   *
   * Steps:
   * 1. Insert the manual classification row.
   * 2. Point the record at the new row.
   * 3. Throw when the record changed in the meantime.
   *
   * @param manualClassification - The manual classification and the state the reviewer saw.
   * @param transaction - The open transaction that holds the row lock.
   * @throws ProblemException `STALE_CLASSIFICATION` when the record changed.
   */
  public async storeAndApply(
    manualClassification: ManualClassificationInterface,
    transaction: Transaction,
  ): Promise<void> {
    // 1. Insert the manual classification row.
    const classificationId = await this.reviewRepository.insertManualClassification(transaction, {
      recordId: manualClassification.recordId,
      kind: manualClassification.kind,
      categoryCode: manualClassification.categoryCode,
      reason: manualClassification.reason,
      reviewedBy: manualClassification.reviewedBy,
      supersedesId: manualClassification.supersedesId,
    });

    // 2. Point the record at the new row.
    const isApplied = await this.reviewRepository.applyToRecord(
      transaction,
      manualClassification.recordId,
      classificationId,
      manualClassification.categoryCode,
      manualClassification.expectedCurrentClassificationId,
      manualClassification.allowedFrom,
    );

    // 3. Throw when the record changed in the meantime.
    if (!isApplied) {
      throw new ProblemException(
        HttpStatus.CONFLICT,
        ErrorCodeEnum.STALE_CLASSIFICATION,
        "The record changed; reload and try again",
      );
    }
  }
}
