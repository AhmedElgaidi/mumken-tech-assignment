import { Transaction } from "sequelize";
import { ErrorCodeEnum } from "../../../infrastructure/contracts/enums/http/error-code.enum";
import { ProblemException } from "../../../infrastructure/exceptions/http/problem.exception";
import { ReviewRepository } from "../../../infrastructure/repositories/classification/review.repository";
import { ServiceResultUtil } from "../../../infrastructure/utils/http/service-result.util";
import { CategoryService } from "../../category/services/category.service";
import { RecordDetailInterface } from "../../record/contracts/interfaces/record-detail.interface";
import { CorrectClassificationDto } from "../contracts/dtos/correct-classification.dto";
import { ReviewApprovalService } from "./review-approval.service";
import { ReviewCorrectionService } from "./review-correction.service";
import { ReviewService } from "./review.service";

describe("ReviewService", () => {
  const recordId = "11111111-1111-4111-8111-111111111111";
  const classificationId = "22222222-2222-4222-8222-222222222222";
  const detail = { id: recordId } as RecordDetailInterface;
  const approveDto = { reviewedBy: "nada", expectedCurrentClassificationId: classificationId };
  const correctDto: CorrectClassificationDto = {
    categoryCode: "  Health ",
    reason: "why",
    reviewedBy: "nada",
    expectedCurrentClassificationId: classificationId,
  };

  let transaction: { commit: jest.Mock; rollback: jest.Mock };
  let reviewRepository: { createTransaction: jest.Mock };
  let approvalService: { approve: jest.Mock };
  let correctionService: { correct: jest.Mock };
  let categoryService: { getCodes: jest.Mock };
  let service: ReviewService;

  beforeEach(() => {
    transaction = { commit: jest.fn().mockResolvedValue(undefined), rollback: jest.fn().mockResolvedValue(undefined) };
    reviewRepository = { createTransaction: jest.fn().mockResolvedValue(transaction) };
    approvalService = { approve: jest.fn() };
    correctionService = { correct: jest.fn() };
    categoryService = { getCodes: jest.fn().mockResolvedValue(new Set(["health", "sports"])) };
    service = new ReviewService(
      reviewRepository as unknown as ReviewRepository,
      approvalService as unknown as ReviewApprovalService,
      correctionService as unknown as ReviewCorrectionService,
      categoryService as unknown as CategoryService,
    );
  });

  describe("approve", () => {
    it("commits and returns the approval result", async () => {
      const result = ServiceResultUtil.of(detail, { isCreated: true });
      approvalService.approve.mockResolvedValue(result);

      await expect(service.approve(recordId, approveDto)).resolves.toBe(result);
      expect(approvalService.approve).toHaveBeenCalledWith(recordId, approveDto, transaction as unknown as Transaction);
      expect(transaction.commit).toHaveBeenCalledTimes(1);
      expect(transaction.rollback).not.toHaveBeenCalled();
    });

    it("returns a repeat result without isCreated", async () => {
      const result = ServiceResultUtil.of(detail);
      approvalService.approve.mockResolvedValue(result);

      const actual = await service.approve(recordId, approveDto);

      expect(actual).toBe(result);
      expect(actual.isCreated).toBeUndefined();
    });

    it("rolls back and rethrows when the approval fails", async () => {
      const error = new ProblemException(409, ErrorCodeEnum.STALE_CLASSIFICATION, "stale");
      approvalService.approve.mockRejectedValue(error);

      await expect(service.approve(recordId, approveDto)).rejects.toBe(error);
      expect(transaction.rollback).toHaveBeenCalledTimes(1);
      expect(transaction.commit).not.toHaveBeenCalled();
    });

    it("rethrows the original error when the rollback also fails", async () => {
      const error = new Error("original");
      approvalService.approve.mockRejectedValue(error);
      transaction.rollback.mockRejectedValue(new Error("rollback failed"));

      await expect(service.approve(recordId, approveDto)).rejects.toBe(error);
    });

    it("rolls back when the commit fails", async () => {
      const error = new Error("commit failed");
      approvalService.approve.mockResolvedValue(ServiceResultUtil.of(detail));
      transaction.commit.mockRejectedValue(error);

      await expect(service.approve(recordId, approveDto)).rejects.toBe(error);
      expect(transaction.rollback).toHaveBeenCalledTimes(1);
    });
  });

  describe("correct", () => {
    it("normalises the category, commits and returns the result", async () => {
      const result = ServiceResultUtil.of(detail, { isCreated: true });
      correctionService.correct.mockResolvedValue(result);

      await expect(service.correct(recordId, correctDto)).resolves.toBe(result);
      expect(correctionService.correct).toHaveBeenCalledWith(
        recordId,
        correctDto,
        "health",
        transaction as unknown as Transaction,
      );
      expect(transaction.commit).toHaveBeenCalledTimes(1);
    });

    it("classifies a FAILED record by hand with a null expected id", async () => {
      const dto = { ...correctDto, expectedCurrentClassificationId: null };
      correctionService.correct.mockResolvedValue(ServiceResultUtil.of(detail, { isCreated: true }));

      await service.correct(recordId, dto);

      expect(correctionService.correct).toHaveBeenCalledWith(recordId, dto, "health", expect.anything());
    });

    it("rejects an unknown category before opening any transaction", async () => {
      const dto = { ...correctDto, categoryCode: "astrology" };

      const failure = await service.correct(recordId, dto).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ProblemException);
      expect((failure as ProblemException).code).toBe(ErrorCodeEnum.UNKNOWN_CATEGORY);
      expect((failure as ProblemException).getStatus()).toBe(400);
      expect(reviewRepository.createTransaction).not.toHaveBeenCalled();
      expect(correctionService.correct).not.toHaveBeenCalled();
    });

    it("rolls back and rethrows when the correction fails", async () => {
      const error = new ProblemException(409, ErrorCodeEnum.STALE_CLASSIFICATION, "stale");
      correctionService.correct.mockRejectedValue(error);

      await expect(service.correct(recordId, correctDto)).rejects.toBe(error);
      expect(transaction.rollback).toHaveBeenCalledTimes(1);
      expect(transaction.commit).not.toHaveBeenCalled();
    });

    it("rethrows the original error when the rollback also fails", async () => {
      const error = new Error("original");
      correctionService.correct.mockRejectedValue(error);
      transaction.rollback.mockRejectedValue(new Error("rollback failed"));

      await expect(service.correct(recordId, correctDto)).rejects.toBe(error);
    });
  });
});
