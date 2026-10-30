import { Transaction } from "sequelize";
import { ErrorCodeEnum } from "../../../infrastructure/contracts/enums/http/error-code.enum";
import { ClassificationRowInterface } from "../../../infrastructure/contracts/interfaces/sql-db/classification/classification-row.interface";
import { RecordRowInterface } from "../../../infrastructure/contracts/interfaces/sql-db/record/record-row.interface";
import { ProblemException } from "../../../infrastructure/exceptions/http/problem.exception";
import { RecordRepository } from "../../../infrastructure/repositories/record/record.repository";
import { RecordDetailInterface } from "../../record/contracts/interfaces/record-detail.interface";
import { RecordService } from "../../record/services/record.service";
import { ReviewRecordService } from "./review-record.service";

describe("ReviewRecordService", () => {
  const transaction = {} as Transaction;
  let recordRepository: { findById: jest.Mock; findClassificationHistory: jest.Mock };
  let recordService: { getRecordDetail: jest.Mock };
  let service: ReviewRecordService;

  const buildRecord = (overrides: Partial<RecordRowInterface> = {}): RecordRowInterface =>
    ({ id: "rec-1", currentClassificationId: null, ...overrides }) as RecordRowInterface;

  beforeEach(() => {
    recordRepository = { findById: jest.fn(), findClassificationHistory: jest.fn() };
    recordService = { getRecordDetail: jest.fn() };
    service = new ReviewRecordService(
      recordRepository as unknown as RecordRepository,
      recordService as unknown as RecordService,
    );
  });

  describe("lockRecord", () => {
    it("loads the record under a row lock", async () => {
      const record = buildRecord();
      recordRepository.findById.mockResolvedValue(record);

      await expect(service.lockRecord("rec-1", transaction)).resolves.toBe(record);
      expect(recordRepository.findById).toHaveBeenCalledWith("rec-1", transaction, true);
    });

    it("throws 404 NOT_FOUND when the record is missing", async () => {
      recordRepository.findById.mockResolvedValue(null);

      const failure = await service.lockRecord("rec-1", transaction).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ProblemException);
      expect((failure as ProblemException).code).toBe(ErrorCodeEnum.NOT_FOUND);
      expect((failure as ProblemException).getStatus()).toBe(404);
    });
  });

  describe("findCurrentClassification", () => {
    it("returns null without reading history when the record has no current classification", async () => {
      await expect(service.findCurrentClassification(buildRecord(), transaction)).resolves.toBeNull();
      expect(recordRepository.findClassificationHistory).not.toHaveBeenCalled();
    });

    it("returns the row the record points at", async () => {
      const current = { id: "cls-2" } as ClassificationRowInterface;
      recordRepository.findClassificationHistory.mockResolvedValue([{ id: "cls-1" }, current]);

      const actual = await service.findCurrentClassification(
        buildRecord({ currentClassificationId: "cls-2" }),
        transaction,
      );

      expect(actual).toBe(current);
      expect(recordRepository.findClassificationHistory).toHaveBeenCalledWith("rec-1", transaction);
    });

    it("returns null when the pointed row is not in the history", async () => {
      recordRepository.findClassificationHistory.mockResolvedValue([{ id: "cls-1" }]);

      await expect(
        service.findCurrentClassification(buildRecord({ currentClassificationId: "cls-9" }), transaction),
      ).resolves.toBeNull();
    });
  });

  describe("createConflictException", () => {
    it("builds a 409 carrying the current record", async () => {
      const current = { id: "rec-1" } as RecordDetailInterface;
      recordService.getRecordDetail.mockResolvedValue(current);

      const exception = await service.createConflictException(
        ErrorCodeEnum.NOT_IN_REVIEW,
        "not in review",
        "rec-1",
        transaction,
      );

      expect(exception).toBeInstanceOf(ProblemException);
      expect(exception.getStatus()).toBe(409);
      expect(exception.code).toBe(ErrorCodeEnum.NOT_IN_REVIEW);
      expect(exception.message).toBe("not in review");
      expect(exception.extras).toEqual({ current });
      expect(recordService.getRecordDetail).toHaveBeenCalledWith("rec-1", transaction);
    });
  });
});
