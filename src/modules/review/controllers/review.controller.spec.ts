import { ServiceResultUtil } from "../../../infrastructure/utils/http/service-result.util";
import { RecordDetailInterface } from "../../record/contracts/interfaces/record-detail.interface";
import { ApproveReviewDto } from "../contracts/dtos/approve-review.dto";
import { CorrectClassificationDto } from "../contracts/dtos/correct-classification.dto";
import { ReviewService } from "../services/review.service";
import { ReviewController } from "./review.controller";

describe("ReviewController", () => {
  const recordId = "11111111-1111-4111-8111-111111111111";
  const detail = { id: recordId } as RecordDetailInterface;
  let reviewService: { approve: jest.Mock; correct: jest.Mock };
  let controller: ReviewController;

  beforeEach(() => {
    reviewService = { approve: jest.fn(), correct: jest.fn() };
    controller = new ReviewController(reviewService as unknown as ReviewService);
  });

  it("delegates approval unchanged and returns the service value", async () => {
    const body: ApproveReviewDto = {
      reviewedBy: "nada",
      expectedCurrentClassificationId: "22222222-2222-4222-8222-222222222222",
    };
    const result = ServiceResultUtil.of(detail, { isCreated: true });
    reviewService.approve.mockResolvedValue(result);

    await expect(controller.approveReview(recordId, body)).resolves.toBe(result);
    expect(reviewService.approve).toHaveBeenCalledWith(recordId, body);
  });

  it("delegates correction unchanged and returns the service value", async () => {
    const body: CorrectClassificationDto = {
      categoryCode: "health",
      reason: "About inspections",
      reviewedBy: "nada",
      expectedCurrentClassificationId: null,
    };
    const result = ServiceResultUtil.of(detail);
    reviewService.correct.mockResolvedValue(result);

    await expect(controller.correctClassification(recordId, body)).resolves.toBe(result);
    expect(reviewService.correct).toHaveBeenCalledWith(recordId, body);
  });

  it("propagates service errors", async () => {
    const error = new Error("boom");
    reviewService.approve.mockRejectedValue(error);

    await expect(
      controller.approveReview(recordId, { reviewedBy: "a", expectedCurrentClassificationId: recordId }),
    ).rejects.toBe(error);
  });
});
