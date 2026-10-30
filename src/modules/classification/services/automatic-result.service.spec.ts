import { DEFAULT_APP_SETTINGS } from "../../../infrastructure/constants/settings/app-settings.constant";
import { CategoryService } from "../../category/services/category.service";
import { FALLBACK_CATEGORY_CODE } from "../constants/lifecycle/classification.constant";
import { PermanentClassificationException } from "../exceptions/permanent-classification.exception";
import { ClassifierInterface, ClassifierResultInterface } from "../contracts/interfaces/worker/classifier.interface";
import { AutomaticResultService } from "./automatic-result.service";

describe("AutomaticResultService", () => {
  const threshold = DEFAULT_APP_SETTINGS.classification.reviewThreshold;
  const classifier = { name: "test-classifier" } as unknown as ClassifierInterface;
  const categoryService = {
    getCodes: jest.fn().mockResolvedValue(new Set(["billing", FALLBACK_CATEGORY_CODE])),
  } as unknown as CategoryService;
  const service = new AutomaticResultService(categoryService, DEFAULT_APP_SETTINGS, classifier);
  const answer = (confidence: unknown, categoryCode: unknown = "billing"): ClassifierResultInterface =>
    ({ categoryCode, confidence }) as unknown as ClassifierResultInterface;

  it("classifies a known category at the threshold without review", async () => {
    const result = await service.build(answer(threshold));
    expect(result).toMatchObject({
      categoryCode: "billing",
      confidence: threshold,
      isReviewNeeded: false,
      classifier: "test-classifier",
    });
  });

  it("flags a known category below the threshold for review", async () => {
    const result = await service.build(answer(threshold - 0.01));
    expect(result.isReviewNeeded).toBe(true);
    expect(result.categoryCode).toBe("billing");
  });

  it("sends an unknown category to review as the fallback with zero confidence", async () => {
    const result = await service.build(answer(0.99, "nonsense"));
    expect(result).toMatchObject({
      categoryCode: FALLBACK_CATEGORY_CODE,
      confidence: 0,
      isReviewNeeded: true,
      rawOutput: { unknownCategory: "nonsense" },
    });
  });

  it("treats a non-string category as unknown", async () => {
    const result = await service.build(answer(0.9, 42));
    expect(result.categoryCode).toBe(FALLBACK_CATEGORY_CODE);
    expect(result.isReviewNeeded).toBe(true);
  });

  it("stores the raw answer when the classifier supplied one", async () => {
    const raw = { vendor: "payload" };
    const result = await service.build({ ...answer(0.9), raw } as ClassifierResultInterface);
    expect(result.rawOutput).toBe(raw);
  });

  it.each([[-0.1], [1.1], [Number.NaN], [Number.POSITIVE_INFINITY], ["0.9"], [null], [undefined]])(
    "rejects invalid confidence %p as permanent",
    async (confidence) => {
      await expect(service.build(answer(confidence))).rejects.toBeInstanceOf(PermanentClassificationException);
    },
  );

  it("accepts the boundaries 0 and 1", async () => {
    await expect(service.build(answer(0))).resolves.toMatchObject({ isReviewNeeded: true });
    await expect(service.build(answer(1))).resolves.toMatchObject({ isReviewNeeded: false });
  });
});
