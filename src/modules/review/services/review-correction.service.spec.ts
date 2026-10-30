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
import { CorrectClassificationDto } from "../contracts/dtos/correct-classification.dto";
import { ManualClassificationService } from "./manual-classification.service";
import { ReviewCorrectionService } from "./review-correction.service";
import { ReviewRecordService } from "./review-record.service";

describe("ReviewCorrectionService", () => {
  const transaction = {} as Transaction;
  const detail = { id: "rec-1" } as RecordDetailInterface;
  const dto: CorrectClassificationDto = {
    categoryCode: "Sports",
    reason: "about football",
    reviewedBy: "nada",
    expectedCurrentClassificationId: "cls-auto",
  };
  const automatic = {
    id: "cls-auto",
    kind: ClassificationKindEnum.AUTOMATIC,
    categoryCode: "health",
    supersedesId: null,
    reason: null,
    reviewedBy: null,
  } as ClassificationRowInterface;

  let reviewRecordService: {
    lockRecord: jest.Mock;
    findCurrentClassification: jest.Mock;
    createConflictException: jest.Mock;
  };
  let manualClassificationService: { storeAndApply: jest.Mock };
  let recordService: { getRecordDetail: jest.Mock };
  let service: ReviewCorrectionService;

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
    service = new ReviewCorrectionService(
      reviewRecordService as unknown as ReviewRecordService,
      manualClassificationService as unknown as ManualClassificationService,
      recordService as unknown as RecordService,
    );
  });

  it("stores a MANUAL_CORRECTION that supersedes the current row", async () => {
    reviewRecordService.lockRecord.mockResolvedValue(
      buildRecord({ classificationStatus: RecordStatusEnum.NEEDS_REVIEW }),
    );
    reviewRecordService.findCurrentClassification.mockResolvedValue(automatic);

    const result = await service.correct("rec-1", dto, "sports", transaction);

    expect(manualClassificationService.storeAndApply).toHaveBeenCalledWith(
      {
        recordId: "rec-1",
        kind: ClassificationKindEnum.MANUAL_CORRECTION,
        categoryCode: "sports",
        reason: "about football",
        reviewedBy: "nada",
        supersedesId: "cls-auto",
        expectedCurrentClassificationId: "cls-auto",
        allowedFrom: RecordStatusMachineUtil.getFromStatuses(RecordTriggerEnum.CORRECT),
      },
      transaction,
    );
    expect(result.data).toBe(detail);
    expect(result.isCreated).toBe(true);
  });

  it("classifies a FAILED record by hand with a null expected id", async () => {
    const manualDto = { ...dto, expectedCurrentClassificationId: null };
    reviewRecordService.lockRecord.mockResolvedValue(
      buildRecord({ classificationStatus: RecordStatusEnum.FAILED, currentClassificationId: null }),
    );
    reviewRecordService.findCurrentClassification.mockResolvedValue(null);

    const result = await service.correct("rec-1", manualDto, "sports", transaction);

    expect(manualClassificationService.storeAndApply).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: ClassificationKindEnum.MANUAL_CORRECTION,
        supersedesId: null,
        expectedCurrentClassificationId: null,
        allowedFrom: RecordStatusMachineUtil.getFromStatuses(RecordTriggerEnum.CLASSIFY_MANUALLY),
      }),
      transaction,
    );
    expect(result.isCreated).toBe(true);
  });

  it.each([RecordStatusEnum.PENDING, RecordStatusEnum.PROCESSING])(
    "refuses a %s record with CLASSIFICATION_IN_PROGRESS",
    async (status) => {
      reviewRecordService.lockRecord.mockResolvedValue(buildRecord({ classificationStatus: status }));

      const failure = await service.correct("rec-1", dto, "sports", transaction).catch((error: unknown) => error);

      expect((failure as ProblemException).code).toBe(ErrorCodeEnum.CLASSIFICATION_IN_PROGRESS);
      expect(manualClassificationService.storeAndApply).not.toHaveBeenCalled();
    },
  );

  it("returns the current record without a new row on a repeated correction", async () => {
    reviewRecordService.lockRecord.mockResolvedValue(
      buildRecord({ classificationStatus: RecordStatusEnum.CLASSIFIED }),
    );
    reviewRecordService.findCurrentClassification.mockResolvedValue({
      id: "cls-corr",
      kind: ClassificationKindEnum.MANUAL_CORRECTION,
      categoryCode: "sports",
      supersedesId: "cls-auto",
      reason: "about football",
      reviewedBy: "nada",
    });

    const result = await service.correct("rec-1", dto, "sports", transaction);

    expect(result.data).toBe(detail);
    expect(result.isCreated).toBeUndefined();
    expect(manualClassificationService.storeAndApply).not.toHaveBeenCalled();
  });

  it("throws 409 STALE_CLASSIFICATION when the expected id is not current", async () => {
    reviewRecordService.lockRecord.mockResolvedValue(
      buildRecord({ classificationStatus: RecordStatusEnum.NEEDS_REVIEW, currentClassificationId: "cls-newer" }),
    );
    reviewRecordService.findCurrentClassification.mockResolvedValue({ ...automatic, id: "cls-newer" });

    const failure = await service.correct("rec-1", dto, "sports", transaction).catch((error: unknown) => error);

    expect((failure as ProblemException).code).toBe(ErrorCodeEnum.STALE_CLASSIFICATION);
    expect((failure as ProblemException).getStatus()).toBe(409);
    expect(manualClassificationService.storeAndApply).not.toHaveBeenCalled();
  });

  it("throws 422 SAME_CATEGORY when the record already has the category", async () => {
    reviewRecordService.lockRecord.mockResolvedValue(
      buildRecord({ classificationStatus: RecordStatusEnum.NEEDS_REVIEW }),
    );
    reviewRecordService.findCurrentClassification.mockResolvedValue(automatic);

    const failure = await service.correct("rec-1", dto, "health", transaction).catch((error: unknown) => error);

    expect((failure as ProblemException).code).toBe(ErrorCodeEnum.SAME_CATEGORY);
    expect((failure as ProblemException).getStatus()).toBe(422);
    expect(manualClassificationService.storeAndApply).not.toHaveBeenCalled();
  });

  it("propagates NOT_FOUND from the lock", async () => {
    const error = new ProblemException(404, ErrorCodeEnum.NOT_FOUND, "missing");
    reviewRecordService.lockRecord.mockRejectedValue(error);

    await expect(service.correct("rec-1", dto, "sports", transaction)).rejects.toBe(error);
  });
});
