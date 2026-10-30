import { HttpStatus, Injectable } from "@nestjs/common";
import { Transaction } from "sequelize";
import { ErrorCodeEnum } from "../../../infrastructure/contracts/enums/http/error-code.enum";
import { ServiceResultInterface } from "../../../infrastructure/contracts/interfaces/http/service-result.interface";
import { ServiceResultUtil } from "../../../infrastructure/utils/http/service-result.util";
import { ProblemException } from "../../../infrastructure/exceptions/http/problem.exception";
import { IN_FLIGHT_STATUSES } from "../../classification/constants/lifecycle/record-transition.constant";
import { ClassificationKindEnum } from "../../classification/contracts/enums/lifecycle/classification-kind.enum";
import { RecordStatusMachineUtil } from "../../classification/utils/record-status-machine.util";
import { RecordDetailInterface } from "../../record/contracts/interfaces/record-detail.interface";
import { RecordService } from "../../record/services/record.service";
import { CorrectClassificationDto } from "../contracts/dtos/correct-classification.dto";
import { ReviewDecisionUtil } from "../utils/review-decision.util";
import { ManualClassificationService } from "./manual-classification.service";
import { ReviewRecordService } from "./review-record.service";

/** The correct decision: validates it against the locked record and stores it. */
@Injectable()
export class ReviewCorrectionService {
  public constructor(
    private readonly reviewRecordService: ReviewRecordService,
    private readonly manualClassificationService: ManualClassificationService,
    private readonly recordService: RecordService,
  ) {}

  /**
   * Runs the correction inside the open transaction.
   *
   * Steps:
   * 1. Lock the record
   * 2. Refuse a record that is still being classified
   * 3. Load its current classification
   * 4. Return a repeat of the same correction
   * 5. Check the reviewer saw the current classification
   * 6. Refuse a correction to the category the record already has
   * 7. Store the correction and apply it to the record
   * 8. Return the record
   *
   * @param recordId - The record to correct.
   * @param dto - The correction the reviewer sent.
   * @param categoryCode - The normalised category the reviewer chose.
   * @param transaction - The open transaction.
   * @returns The record, flagged `isCreated` when a new correction was stored.
   * @throws ProblemException `NOT_FOUND`, `CLASSIFICATION_IN_PROGRESS`, `STALE_CLASSIFICATION` or `SAME_CATEGORY`.
   */
  public async correct(
    recordId: string,
    dto: CorrectClassificationDto,
    categoryCode: string,
    transaction: Transaction,
  ): Promise<ServiceResultInterface<RecordDetailInterface>> {
    // 1. Lock the record
    const record = await this.reviewRecordService.lockRecord(recordId, transaction);

    // 2. Refuse a record that is still being classified
    if (IN_FLIGHT_STATUSES.includes(record.classificationStatus)) {
      throw await this.reviewRecordService.createConflictException(
        ErrorCodeEnum.CLASSIFICATION_IN_PROGRESS,
        "The record is still being classified; try again when it is finished",
        recordId,
        transaction,
      );
    }

    // 3. Load its current classification
    const currentClassification = await this.reviewRecordService.findCurrentClassification(record, transaction);

    // 4. Return a repeat of the same correction
    if (ReviewDecisionUtil.isRepeatedCorrection(currentClassification, categoryCode, dto)) {
      return ServiceResultUtil.of(await this.recordService.getRecordDetail(recordId, transaction));
    }

    // 5. Check the reviewer saw the current classification
    if (record.currentClassificationId !== dto.expectedCurrentClassificationId) {
      throw await this.reviewRecordService.createConflictException(
        ErrorCodeEnum.STALE_CLASSIFICATION,
        "The classification changed since you loaded it; reload and try again",
        recordId,
        transaction,
      );
    }

    // 6. Refuse a correction to the category the record already has
    if (currentClassification?.categoryCode === categoryCode) {
      throw new ProblemException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCodeEnum.SAME_CATEGORY,
        "The record already has this category; use POST /records/:id/review/approve to accept it",
      );
    }

    // 7. Store the correction and apply it to the record
    await this.manualClassificationService.storeAndApply(
      {
        recordId,
        kind: ClassificationKindEnum.MANUAL_CORRECTION,
        categoryCode,
        reason: dto.reason,
        reviewedBy: dto.reviewedBy,
        supersedesId: currentClassification?.id ?? null,
        expectedCurrentClassificationId: dto.expectedCurrentClassificationId,
        allowedFrom: RecordStatusMachineUtil.getFromStatuses(ReviewDecisionUtil.resolveCorrectionTrigger(record)),
      },
      transaction,
    );

    // 8. Return the record
    return ServiceResultUtil.of(await this.recordService.getRecordDetail(recordId, transaction), { isCreated: true });
  }
}
