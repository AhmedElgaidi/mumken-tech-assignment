import { Transaction } from "sequelize";
import { ErrorCodeEnum } from "../../../infrastructure/contracts/enums/http/error-code.enum";
import { ProblemException } from "../../../infrastructure/exceptions/http/problem.exception";
import { ReviewRepository } from "../../../infrastructure/repositories/classification/review.repository";
import { ClassificationKindEnum } from "../../classification/contracts/enums/lifecycle/classification-kind.enum";
import { RecordStatusEnum } from "../../classification/contracts/enums/lifecycle/record-status.enum";
import { ManualClassificationInterface } from "../contracts/interfaces/manual-classification.interface";
import { ManualClassificationService } from "./manual-classification.service";

describe("ManualClassificationService", () => {
  const transaction = {} as Transaction;
  const manual: ManualClassificationInterface = {
    recordId: "rec-1",
    kind: ClassificationKindEnum.MANUAL_CORRECTION,
    categoryCode: "health",
    reason: "why",
    reviewedBy: "nada",
    supersedesId: "cls-old",
    expectedCurrentClassificationId: "cls-old",
    allowedFrom: [RecordStatusEnum.NEEDS_REVIEW, RecordStatusEnum.CLASSIFIED],
  };
  let reviewRepository: { insertManualClassification: jest.Mock; applyToRecord: jest.Mock };
  let service: ManualClassificationService;

  beforeEach(() => {
    reviewRepository = {
      insertManualClassification: jest.fn().mockResolvedValue("cls-new"),
      applyToRecord: jest.fn().mockResolvedValue(true),
    };
    service = new ManualClassificationService(reviewRepository as unknown as ReviewRepository);
  });

  it("inserts the row then points the record at it", async () => {
    await expect(service.storeAndApply(manual, transaction)).resolves.toBeUndefined();

    expect(reviewRepository.insertManualClassification).toHaveBeenCalledWith(transaction, {
      recordId: "rec-1",
      kind: ClassificationKindEnum.MANUAL_CORRECTION,
      categoryCode: "health",
      reason: "why",
      reviewedBy: "nada",
      supersedesId: "cls-old",
    });
    expect(reviewRepository.applyToRecord).toHaveBeenCalledWith(
      transaction,
      "rec-1",
      "cls-new",
      "health",
      "cls-old",
      manual.allowedFrom,
    );
    expect(reviewRepository.insertManualClassification.mock.invocationCallOrder[0]).toBeLessThan(
      reviewRepository.applyToRecord.mock.invocationCallOrder[0],
    );
  });

  it("supports a record with no previous classification", async () => {
    await service.storeAndApply({ ...manual, supersedesId: null, expectedCurrentClassificationId: null }, transaction);

    expect(reviewRepository.applyToRecord).toHaveBeenCalledWith(
      transaction,
      "rec-1",
      "cls-new",
      "health",
      null,
      manual.allowedFrom,
    );
  });

  it("throws 409 STALE_CLASSIFICATION when the record was not updated", async () => {
    reviewRepository.applyToRecord.mockResolvedValue(false);

    const failure = await service.storeAndApply(manual, transaction).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ProblemException);
    expect((failure as ProblemException).code).toBe(ErrorCodeEnum.STALE_CLASSIFICATION);
    expect((failure as ProblemException).getStatus()).toBe(409);
  });

  it("does not apply when the insert fails", async () => {
    const error = new Error("insert failed");
    reviewRepository.insertManualClassification.mockRejectedValue(error);

    await expect(service.storeAndApply(manual, transaction)).rejects.toBe(error);
    expect(reviewRepository.applyToRecord).not.toHaveBeenCalled();
  });
});
