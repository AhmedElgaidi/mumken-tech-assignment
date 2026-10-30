import { Injectable } from "@nestjs/common";
import { Transaction } from "sequelize";
import { ErrorCodeEnum } from "../../../infrastructure/contracts/enums/http/error-code.enum";
import { ServiceResultInterface } from "../../../infrastructure/contracts/interfaces/http/service-result.interface";
import { ServiceResultUtil } from "../../../infrastructure/utils/http/service-result.util";
import { ClassificationKindEnum } from "../../classification/contracts/enums/lifecycle/classification-kind.enum";
import { RecordStatusEnum } from "../../classification/contracts/enums/lifecycle/record-status.enum";
import { RecordTriggerEnum } from "../../classification/contracts/enums/lifecycle/record-trigger.enum";
import { RecordStatusMachineUtil } from "../../classification/utils/record-status-machine.util";
import { RecordDetailInterface } from "../../record/contracts/interfaces/record-detail.interface";
import { RecordService } from "../../record/services/record.service";
import { ApproveReviewDto } from "../contracts/dtos/approve-review.dto";
import { ReviewDecisionUtil } from "../utils/review-decision.util";
import { ManualClassificationService } from "./manual-classification.service";
import { ReviewRecordService } from "./review-record.service";

/** The approve decision: validates it against the locked record and stores it. */
@Injectable()
export class ReviewApprovalService {
  public constructor(
    private readonly reviewRecordService: ReviewRecordService,
    private readonly manualClassificationService: ManualClassificationService,
    private readonly recordService: RecordService,
  ) {}

  /**
   * Runs the approval inside the open transaction.
   *
   * Steps:
   * 1. Lock the record
   * 2. Load its current classification
   * 3. Return a repeat of the same approval
   * 4. Check the record is waiting for review
   * 5. Check the reviewer saw the current classification
   * 6. Store the approval and apply it to the record
   * 7. Return the record
   *
   * @param recordId - The record to approve.
   * @param dto - The reviewer and the classification id they saw.
   * @param transaction - The open transaction.
   * @returns The record, flagged `isCreated` when a new approval was stored.
   * @throws ProblemException `NOT_FOUND`, `NOT_IN_REVIEW` or `STALE_CLASSIFICATION`.
   */
  public async approve(
    recordId: string,
    dto: ApproveReviewDto,
    transaction: Transaction,
  ): Promise<ServiceResultInterface<RecordDetailInterface>> {
    // 1. Lock the record
    const record = await this.reviewRecordService.lockRecord(recordId, transaction);

    // 2. Load its current classification
    const currentClassification = await this.reviewRecordService.findCurrentClassification(record, transaction);

    // 3. Return a repeat of the same approval
    if (ReviewDecisionUtil.isRepeatedApproval(record, currentClassification, dto.expectedCurrentClassificationId)) {
      return ServiceResultUtil.of(await this.recordService.getRecordDetail(recordId, transaction));
    }

    // 4. Check the record is waiting for review
    if (record.classificationStatus !== RecordStatusEnum.NEEDS_REVIEW) {
      throw await this.reviewRecordService.createConflictException(
        ErrorCodeEnum.NOT_IN_REVIEW,
        `Record is ${record.classificationStatus}, not NEEDS_REVIEW`,
        recordId,
        transaction,
      );
    }

    // 5. Check the reviewer saw the current classification
    if (record.currentClassificationId !== dto.expectedCurrentClassificationId || !currentClassification) {
      throw await this.reviewRecordService.createConflictException(
        ErrorCodeEnum.STALE_CLASSIFICATION,
        "The classification changed since you loaded it; reload and review again",
        recordId,
        transaction,
      );
    }

    // 6. Store the approval and apply it to the record
    await this.manualClassificationService.storeAndApply(
      {
        recordId,
        kind: ClassificationKindEnum.MANUAL_APPROVAL,
        categoryCode: currentClassification.categoryCode,
        reason: null,
        reviewedBy: dto.reviewedBy,
        supersedesId: currentClassification.id,
        expectedCurrentClassificationId: currentClassification.id,
        allowedFrom: RecordStatusMachineUtil.getFromStatuses(RecordTriggerEnum.APPROVE),
      },
      transaction,
    );

    // 7. Return the record
    return ServiceResultUtil.of(await this.recordService.getRecordDetail(recordId, transaction), { isCreated: true });
  }
}
