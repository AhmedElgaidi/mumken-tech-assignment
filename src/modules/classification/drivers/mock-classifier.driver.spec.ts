import { CATEGORIES } from "../../../infrastructure/constants/sql-db/category.constant";
import { FALLBACK_CATEGORY_CODE } from "../constants/lifecycle/classification.constant";
import { KEYWORD_RULES } from "../constants/mock-classifier/keyword-rule.constant";
import { MOCK_CLASSIFIER } from "../constants/mock-classifier/mock-classifier.constant";
import { MOCK_TRIGGER } from "../constants/mock-classifier/mock-trigger.constant";
import { MockClassifierDriver } from "./mock-classifier.driver";
import { PermanentClassificationException } from "../exceptions/permanent-classification.exception";
import { TransientClassificationException } from "../exceptions/transient-classification.exception";

const options = { minLatencyMs: 0, maxLatencyMs: 0, failureRate: 0, seed: 42 };
const input = (title: string, attemptNo = 1, description = "") => ({
  title,
  description,
  source: "s",
  date: "2026-10-25",
  attemptNo,
});
const signal = () => new AbortController().signal;

describe("MockClassifierDriver", () => {
  it("picks the category with the most keyword matches; more matches → more confidence", async () => {
    const classifier = new MockClassifierDriver(options);
    const strong = await classifier.classify(input("Hospital vaccine clinic"), signal());
    const weak = await classifier.classify(input("Hospital opens"), signal());
    const none = await classifier.classify(input("Nothing here"), signal());
    expect(strong.categoryCode).toBe("health");
    expect(strong.confidence).toBeGreaterThanOrEqual(MOCK_CLASSIFIER.STRONG_CONFIDENCE_FLOOR);
    expect(weak.confidence).toBeLessThan(0.7);
    expect(none).toMatchObject({
      categoryCode: FALLBACK_CATEGORY_CODE,
      confidence: MOCK_CLASSIFIER.NO_MATCH_CONFIDENCE,
    });
  });

  it("honours the deterministic triggers", async () => {
    const classifier = new MockClassifierDriver(options);
    await expect(classifier.classify(input(`${MOCK_TRIGGER.FAIL_PERMANENT} x`), signal())).rejects.toBeInstanceOf(
      PermanentClassificationException,
    );
    await expect(classifier.classify(input(`${MOCK_TRIGGER.FAIL_TRANSIENT} x`), signal())).rejects.toBeInstanceOf(
      TransientClassificationException,
    );
    await expect(classifier.classify(input(`${MOCK_TRIGGER.FAIL_ONCE} x`, 1), signal())).rejects.toBeInstanceOf(
      TransientClassificationException,
    );
    await expect(classifier.classify(input(`${MOCK_TRIGGER.FAIL_ONCE} x`, 2), signal())).resolves.toBeDefined();
    expect(
      (await classifier.classify(input(`${MOCK_TRIGGER.REVIEW} Hospital vaccine`), signal())).confidence,
    ).toBeLessThan(0.7);
    expect((await classifier.classify(input(`${MOCK_TRIGGER.UNKNOWN_CATEGORY} x`), signal())).categoryCode).toBe(
      MOCK_CLASSIFIER.UNKNOWN_CATEGORY_CODE,
    );
  });

  it("is reproducible with a seed", async () => {
    const run = async () => {
      const classifier = new MockClassifierDriver({ ...options, failureRate: 0.5 });
      const outcomes: string[] = [];
      for (let attempt = 0; attempt < 20; attempt += 1) {
        outcomes.push(
          await classifier.classify(input("Hospital"), signal()).then(
            (answer) => String(answer.confidence),
            () => "fail",
          ),
        );
      }
      return outcomes;
    };
    expect(await run()).toEqual(await run());
  });

  it("stops waiting when the signal aborts (so the timeout is real)", async () => {
    const classifier = new MockClassifierDriver({
      ...options,
      minLatencyMs: 5000,
      maxLatencyMs: 5000,
    });
    await expect(classifier.classify(input("x"), AbortSignal.timeout(20))).rejects.toThrow();
  });

  it("only returns category codes that exist in the category list", () => {
    const knownCodes = new Set(CATEGORIES.map((category) => category.code));
    for (const rule of KEYWORD_RULES) {
      expect(knownCodes.has(rule.categoryCode)).toBe(true);
    }
    expect(knownCodes.has(FALLBACK_CATEGORY_CODE)).toBe(true);
  });
});
