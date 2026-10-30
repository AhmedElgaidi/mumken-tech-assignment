import { Transaction } from "sequelize";
import { ErrorCodeEnum } from "../../../infrastructure/contracts/enums/http/error-code.enum";
import { ClassificationRowInterface } from "../../../infrastructure/contracts/interfaces/sql-db/classification/classification-row.interface";
import { RecordRowInterface } from "../../../infrastructure/contracts/interfaces/sql-db/record/record-row.interface";
import { ProblemException } from "../../../infrastructure/exceptions/http/problem.exception";
import { ClassificationKindEnum } from "../../classification/contracts/enums/lifecycle/classification-kind.enum";
import { RecordStatusEnum } from "../../classification/contracts/enums/lifecycle/record-status.enum";
import { RecordTriggerEnum } from "../../classification/contracts/enums/lifecycle/record-trigger.enum";
import { RecordStatusMachineUtil } from "../../classification/utils/record-status-machine.util";
import { RecordDetailInterface } from "../../record/contracts/interfaces/record-detail.interface";
import { RecordService } from "../../record/services/record.service";
import { ManualClassificationService } from "./manual-classification.service";
import { ReviewApprovalService } from "./review-approval.service";
import { ReviewRecordService } from "./review-record.service";

describe("ReviewApprovalService", () => {
  const transaction = {} as Transaction;
  const detail = { id: "rec-1" } as RecordDetailInterface;
  const dto = { reviewedBy: "nada", expectedCurrentClassificationId: "cls-auto" };
  const automatic = {
    id: "cls-auto",
    kind: ClassificationKindEnum.AUTOMATIC,
    categoryCode: "health",
    supersedesId: null,
  } as ClassificationRowInterface;

  let reviewRecordService: {
    lockRecord: jest.Mock;
    findCurrentClassification: jest.Mock;
    createConflictException: jest.Mock;
  };
  let manualClassificationService: { storeAndApply: jest.Mock };
  let recordService: { getRecordDetail: jest.Mock };
  let service: ReviewApprovalService;

  const buildRecord = (overrides: Partial<RecordRowInterface>): RecordRowInterface =>
    ({ id: "rec-1", currentClassificationId: "cls-auto", ...overrides }) as RecordRowInterface;

  beforeEach(() => {
    reviewRecordService = {
      lockRecord: jest.fn(),
      findCurrentClassification: jest.fn(),
      createConflictException: jest
        .fn()
        .mockImplementation((code: ErrorCodeEnum, message: string) =>
          Promise.resolve(new ProblemException(409, code, message)),
        ),
    };
    manualClassificationService = { storeAndApply: jest.fn().mockResolvedValue(undefined) };
    recordService = { getRecordDetail: jest.fn().mockResolvedValue(detail) };
    service = new ReviewApprovalService(
      reviewRecordService as unknown as ReviewRecordService,
      manualClassificationService as unknown as ManualClassificationService,
      recordService as unknown as RecordService,
    );
  });

  it("stores a MANUAL_APPROVAL and answers isCreated", async () => {
    reviewRecordService.lockRecord.mockResolvedValue(
      buildRecord({ classificationStatus: RecordStatusEnum.NEEDS_REVIEW }),
    );
    reviewRecordService.findCurrentClassification.mockResolvedValue(automatic);

    const result = await service.approve("rec-1", dto, transaction);

    expect(manualClassificationService.storeAndApply).toHaveBeenCalledWith(
      {
        recordId: "rec-1",
        kind: ClassificationKindEnum.MANUAL_APPROVAL,
        categoryCode: "health",
        reason: null,
        reviewedBy: "nada",
        supersedesId: "cls-auto",
        expectedCurrentClassificationId: "cls-auto",
        allowedFrom: RecordStatusMachineUtil.getFromStatuses(RecordTriggerEnum.APPROVE),
      },
      transaction,
    );
    expect(result.data).toBe(detail);
    expect(result.isCreated).toBe(true);
  });

  it("returns the current record without a new row on a repeated approval", async () => {
    reviewRecordService.lockRecord.mockResolvedValue(
      buildRecord({ classificationStatus: RecordStatusEnum.CLASSIFIED }),
    );
    reviewRecordService.findCurrentClassification.mockResolvedValue({
      id: "cls-approval",
      kind: ClassificationKindEnum.MANUAL_APPROVAL,
      categoryCode: "health",
      supersedesId: "cls-auto",
    });

    const result = await service.approve("rec-1", dto, transaction);

    expect(result.data).toBe(detail);
    expect(result.isCreated).toBeUndefined();
    expect(manualClassificationService.storeAndApply).not.toHaveBeenCalled();
  });

  it("throws 409 NOT_IN_REVIEW when the record is not NEEDS_REVIEW", async () => {
    reviewRecordService.lockRecord.mockResolvedValue(buildRecord({ classificationStatus: RecordStatusEnum.FAILED }));
    reviewRecordService.findCurrentClassification.mockResolvedValue(null);

    const failure = await service.approve("rec-1", dto, transaction).catch((error: unknown) => error);

    expect((failure as ProblemException).code).toBe(ErrorCodeEnum.NOT_IN_REVIEW);
    expect(reviewRecordService.createConflictException).toHaveBeenCalledWith(
      ErrorCodeEnum.NOT_IN_REVIEW,
      expect.stringContaining("FAILED"),
      "rec-1",
      transaction,
    );
    expect(manualClassificationService.storeAndApply).not.toHaveBeenCalled();
  });

  it("throws 409 STALE_CLASSIFICATION when the expected id is not current", async () => {
    reviewRecordService.lockRecord.mockResolvedValue(
      buildRecord({ classificationStatus: RecordStatusEnum.NEEDS_REVIEW, currentClassificationId: "cls-newer" }),
    );
    reviewRecordService.findCurrentClassification.mockResolvedValue({ ...automatic, id: "cls-newer" });

    const failure = await service.approve("rec-1", dto, transaction).catch((error: unknown) => error);

    expect((failure as ProblemException).code).toBe(ErrorCodeEnum.STALE_CLASSIFICATION);
    expect((failure as ProblemException).getStatus()).toBe(409);
    expect(manualClassificationService.storeAndApply).not.toHaveBeenCalled();
  });

  it("throws STALE_CLASSIFICATION when the current classification row is missing", async () => {
    reviewRecordService.lockRecord.mockResolvedValue(
      buildRecord({ classificationStatus: RecordStatusEnum.NEEDS_REVIEW }),
    );
    reviewRecordService.findCurrentClassification.mockResolvedValue(null);

    const failure = await service.approve("rec-1", dto, transaction).catch((error: unknown) => error);

    expect((failure as ProblemException).code).toBe(ErrorCodeEnum.STALE_CLASSIFICATION);
  });

  it("propagates NOT_FOUND from the lock", async () => {
    const error = new ProblemException(404, ErrorCodeEnum.NOT_FOUND, "missing");
    reviewRecordService.lockRecord.mockRejectedValue(error);

    await expect(service.approve("rec-1", dto, transaction)).rejects.toBe(error);
  });
});
