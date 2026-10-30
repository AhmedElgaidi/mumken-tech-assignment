import { ErrorCodeEnum } from "../../../infrastructure/contracts/enums/http/error-code.enum";
import { ProblemException } from "../../../infrastructure/exceptions/http/problem.exception";
import { ImportRepository } from "../../../infrastructure/repositories/import/import.repository";
import { RecoveryRepository } from "../../../infrastructure/repositories/record/recovery.repository";
import { FailureKindEnum } from "../../classification/contracts/enums/lifecycle/failure-kind.enum";
import { RecordStatusEnum } from "../../classification/contracts/enums/lifecycle/record-status.enum";
import { ClassificationJobService } from "../../classification/services/classification-job.service";
import { RecordDetailInterface } from "../../record/contracts/interfaces/record-detail.interface";
import { RecordService } from "../../record/services/record.service";
import { RetryDto } from "../contracts/dtos/retry.dto";
import { RecoveryService } from "./recovery.service";

describe("RecoveryService", () => {
  const importId = "imp-1";
  const recordId = "rec-1";
  const noRemaining = { permanent: 0, classified: 0, needsReview: 0, inProgress: 0 };
  let recoveryRepository: { requeueFailedRecords: jest.Mock; countRemaining: jest.Mock };
  let importRepository: { findById: jest.Mock };
  let recordService: { getRecordDetail: jest.Mock };
  let classificationJobService: { enqueue: jest.Mock };
  let service: RecoveryService;

  const buildDetail = (overrides: Partial<RecordDetailInterface>): RecordDetailInterface =>
    ({ id: recordId, failureKind: null, ...overrides }) as RecordDetailInterface;

  const catchProblem = async (promise: Promise<unknown>): Promise<ProblemException> => {
    const failure = await promise.catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ProblemException);
    return failure as ProblemException;
  };

  beforeEach(() => {
    recoveryRepository = {
      requeueFailedRecords: jest.fn().mockResolvedValue([]),
      countRemaining: jest.fn().mockResolvedValue(noRemaining),
    };
    importRepository = { findById: jest.fn().mockResolvedValue({ id: importId }) };
    recordService = { getRecordDetail: jest.fn() };
    classificationJobService = { enqueue: jest.fn().mockResolvedValue(true) };
    service = new RecoveryService(
      recoveryRepository as unknown as RecoveryRepository,
      importRepository as unknown as ImportRepository,
      recordService as unknown as RecordService,
      classificationJobService as unknown as ClassificationJobService,
    );
  });

  describe("retryImport", () => {
    it("requeues, enqueues one job per record with the new generation and reports skips", async () => {
      recoveryRepository.requeueFailedRecords.mockResolvedValue([
        { id: "a", retryGeneration: 2 },
        { id: "b", retryGeneration: 1 },
      ]);
      recoveryRepository.countRemaining.mockResolvedValue({
        permanent: 1,
        classified: 3,
        needsReview: 2,
        inProgress: 2,
      });

      const result = await service.retryImport(importId, new RetryDto(), "req-1");

      expect(recoveryRepository.requeueFailedRecords).toHaveBeenCalledWith({ importId }, false);
      expect(classificationJobService.enqueue).toHaveBeenCalledWith(
        [
          { recordId: "a", generation: 2 },
          { recordId: "b", generation: 1 },
        ],
        "req-1",
      );
      expect(result).toEqual({
        requeued: 2,
        skipped: { permanent: 1, classified: 3, needsReview: 2, inProgress: 0 },
      });
    });

    it("passes isForced through so PERMANENT failures are retried", async () => {
      await service.retryImport(importId, { isForced: true });

      expect(recoveryRepository.requeueFailedRecords).toHaveBeenCalledWith({ importId }, true);
    });

    it("defaults isForced to false", () => {
      expect(new RetryDto().isForced).toBe(false);
    });

    it("requeues nothing on a second retry", async () => {
      recoveryRepository.countRemaining.mockResolvedValue({
        permanent: 1,
        classified: 4,
        needsReview: 0,
        inProgress: 0,
      });

      const result = await service.retryImport(importId, new RetryDto());

      expect(result.requeued).toBe(0);
      expect(result.skipped.inProgress).toBe(0);
      expect(classificationJobService.enqueue).toHaveBeenCalledWith([], undefined);
    });

    it("throws 404 NOT_FOUND for an unknown import before requeueing", async () => {
      importRepository.findById.mockResolvedValue(null);

      const problem = await catchProblem(service.retryImport(importId, new RetryDto()));

      expect(problem.code).toBe(ErrorCodeEnum.NOT_FOUND);
      expect(problem.getStatus()).toBe(404);
      expect(recoveryRepository.requeueFailedRecords).not.toHaveBeenCalled();
      expect(classificationJobService.enqueue).not.toHaveBeenCalled();
    });
  });

  describe("retryRecord", () => {
    it("requeues, enqueues with the new generation and returns the record", async () => {
      const detail = buildDetail({ classificationStatus: RecordStatusEnum.PENDING });
      recoveryRepository.requeueFailedRecords.mockResolvedValue([{ id: recordId, retryGeneration: 3 }]);
      recordService.getRecordDetail.mockResolvedValue(detail);

      await expect(service.retryRecord(recordId, new RetryDto(), "req-1")).resolves.toBe(detail);
      expect(recoveryRepository.requeueFailedRecords).toHaveBeenCalledWith({ recordId }, false);
      expect(classificationJobService.enqueue).toHaveBeenCalledWith([{ recordId, generation: 3 }], "req-1");
    });

    it("passes isForced through", async () => {
      recoveryRepository.requeueFailedRecords.mockResolvedValue([{ id: recordId, retryGeneration: 1 }]);
      recordService.getRecordDetail.mockResolvedValue(buildDetail({}));

      await service.retryRecord(recordId, { isForced: true });

      expect(recoveryRepository.requeueFailedRecords).toHaveBeenCalledWith({ recordId }, true);
    });

    it.each([RecordStatusEnum.PENDING, RecordStatusEnum.PROCESSING])(
      "returns a %s record as it is without enqueueing",
      async (status) => {
        const detail = buildDetail({ classificationStatus: status });
        recordService.getRecordDetail.mockResolvedValue(detail);

        await expect(service.retryRecord(recordId, new RetryDto())).resolves.toBe(detail);
        expect(classificationJobService.enqueue).not.toHaveBeenCalled();
      },
    );

    it.each([RecordStatusEnum.CLASSIFIED, RecordStatusEnum.NEEDS_REVIEW])(
      "refuses a %s record with NOTHING_TO_RECOVER",
      async (status) => {
        const detail = buildDetail({ classificationStatus: status });
        recordService.getRecordDetail.mockResolvedValue(detail);

        const problem = await catchProblem(service.retryRecord(recordId, new RetryDto()));

        expect(problem.code).toBe(ErrorCodeEnum.NOTHING_TO_RECOVER);
        expect(problem.getStatus()).toBe(409);
        expect(problem.extras).toEqual({ current: detail });
      },
    );

    it("refuses a PERMANENT failure without isForced with PERMANENT_FAILURE", async () => {
      const detail = buildDetail({
        classificationStatus: RecordStatusEnum.FAILED,
        failureKind: FailureKindEnum.PERMANENT,
      });
      recordService.getRecordDetail.mockResolvedValue(detail);

      const problem = await catchProblem(service.retryRecord(recordId, new RetryDto()));

      expect(problem.code).toBe(ErrorCodeEnum.PERMANENT_FAILURE);
      expect(problem.getStatus()).toBe(409);
      expect(problem.extras).toEqual({ current: detail });
      expect(classificationJobService.enqueue).not.toHaveBeenCalled();
    });

    it("refuses a FAILED record that is not permanent with NOTHING_TO_RECOVER", async () => {
      recordService.getRecordDetail.mockResolvedValue(
        buildDetail({
          classificationStatus: RecordStatusEnum.FAILED,
          failureKind: FailureKindEnum.TRANSIENT_EXHAUSTED,
        }),
      );

      const problem = await catchProblem(service.retryRecord(recordId, new RetryDto()));

      expect(problem.code).toBe(ErrorCodeEnum.NOTHING_TO_RECOVER);
    });

    it("propagates 404 NOT_FOUND for an unknown record", async () => {
      const error = new ProblemException(404, ErrorCodeEnum.NOT_FOUND, "missing");
      recordService.getRecordDetail.mockRejectedValue(error);

      await expect(service.retryRecord(recordId, new RetryDto())).rejects.toBe(error);
    });
  });
});
