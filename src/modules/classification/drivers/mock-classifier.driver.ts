import { SeededRandomUtil } from "../utils/seeded-random.util";
import { TimeoutUtil } from "../../../infrastructure/utils/timeout/timeout.util";
import { FALLBACK_CATEGORY_CODE } from "../constants/lifecycle/classification.constant";
import {
  ClassifierInputInterface,
  ClassifierInterface,
  ClassifierResultInterface,
} from "../contracts/interfaces/worker/classifier.interface";
import { MockClassifierOptionsInterface } from "../contracts/interfaces/worker/mock-classifier-options.interface";
import { PermanentClassificationException } from "../exceptions/permanent-classification.exception";
import { TransientClassificationException } from "../exceptions/transient-classification.exception";
import { KEYWORD_RULES } from "../constants/mock-classifier/keyword-rule.constant";
import { MOCK_CLASSIFIER } from "../constants/mock-classifier/mock-classifier.constant";
import { MOCK_TRIGGER } from "../constants/mock-classifier/mock-trigger.constant";

/**
 * Behaves like a real provider: latency, random transient failures and uncertain answers.
 * Keyword matches decide the category; the number of matches decides the confidence.
 */
export class MockClassifierDriver implements ClassifierInterface {
  /** Anything outside the ASCII range marks a non-Latin (Arabic) keyword. */
  // eslint-disable-next-line no-control-regex -- the range is "any non-ASCII", not a control character
  private static readonly NON_ASCII_PATTERN = /[^\u0000-\u007f]/;

  /** Regex metacharacters that must be escaped before a keyword becomes a pattern. */
  private static readonly REGEX_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;

  /** Driver name stored on each automatic classification row. */
  public readonly name = MOCK_CLASSIFIER.NAME;
  private readonly random: () => number;

  public constructor(private readonly options: MockClassifierOptionsInterface) {
    this.random = SeededRandomUtil.create(options.seed);
  }

  /**
   * Classifies a record by keyword after a simulated delay. The title triggers in
   * `MOCK_TRIGGER` force a failure, a low confidence or an unknown category, so demos and tests
   * are deterministic; without a trigger the call may still fail at random.
   *
   * Steps:
   * 1. Wait for the simulated latency.
   * 2. Apply the title triggers and the random failure.
   * 3. Resolve the category by keywords and return it.
   *
   * @param input - The record to classify.
   * @param signal - Aborts the simulated delay when the worker's timeout fires.
   * @returns The category with the most keyword matches and a confidence that grows with them.
   * @throws PermanentClassificationException when the title asks for a permanent failure.
   * @throws TransientClassificationException on a transient trigger or a random failure.
   */
  public async classify(input: ClassifierInputInterface, signal: AbortSignal): Promise<ClassifierResultInterface> {
    // 1. Wait for the simulated latency.
    const { minLatencyMs, maxLatencyMs, failureRate } = this.options;
    await TimeoutUtil.delay(minLatencyMs + Math.floor(this.random() * (maxLatencyMs - minLatencyMs + 1)), signal);

    // 2. Apply the title triggers and the random failure.
    const title = input.title.toLowerCase();
    if (title.includes(MOCK_TRIGGER.FAIL_PERMANENT)) {
      throw new PermanentClassificationException("mock: permanent failure requested by the title");
    }
    if (title.includes(MOCK_TRIGGER.FAIL_TRANSIENT)) {
      throw new TransientClassificationException("mock: transient failure requested by the title");
    }
    if (title.includes(MOCK_TRIGGER.FAIL_ONCE) && input.attemptNo === 1) {
      throw new TransientClassificationException("mock: first attempt fails on purpose");
    }
    if (title.includes(MOCK_TRIGGER.UNKNOWN_CATEGORY)) {
      return {
        categoryCode: MOCK_CLASSIFIER.UNKNOWN_CATEGORY_CODE,
        confidence: MOCK_CLASSIFIER.UNKNOWN_CATEGORY_CONFIDENCE,
        raw: { categoryCode: MOCK_CLASSIFIER.UNKNOWN_CATEGORY_CODE },
      };
    }
    if (!MockClassifierDriver.hasTrigger(title) && this.random() < failureRate) {
      throw new TransientClassificationException("mock: random provider failure");
    }

    // 3. Resolve the category by keywords and return it.
    const keywordMatch = this.resolveCategoryByKeywords(`${input.title} ${input.description}`.toLowerCase());
    if (title.includes(MOCK_TRIGGER.REVIEW)) {
      keywordMatch.confidence = MOCK_CLASSIFIER.REVIEW_CONFIDENCE;
    }
    return { ...keywordMatch, raw: { ...keywordMatch, model: this.name } };
  }

  /**
   * Picks the category whose keywords match the text most often.
   *
   * Steps:
   * 1. Find the category with the most keyword matches.
   * 2. Derive the confidence from the match count.
   * 3. Return the category with the confidence rounded.
   *
   * @param text - The lower-cased title and description.
   * @returns The best category and its rounded confidence.
   */
  private resolveCategoryByKeywords(text: string): ClassifierResultInterface {
    // 1. Find the category with the most keyword matches.
    let bestRule = { categoryCode: FALLBACK_CATEGORY_CODE, matches: 0 };
    for (const rule of KEYWORD_RULES) {
      const matches = rule.keywords.filter((keyword) => MockClassifierDriver.isWholeWordMatch(text, keyword)).length;
      if (matches > bestRule.matches) {
        bestRule = { categoryCode: rule.categoryCode, matches };
      }
    }

    // 2. Derive the confidence from the match count.
    const confidence = this.resolveConfidence(bestRule.matches);

    // 3. Return the category with the confidence rounded.
    return {
      categoryCode: bestRule.categoryCode,
      confidence:
        Math.round(confidence * MOCK_CLASSIFIER.CONFIDENCE_ROUNDING_FACTOR) /
        MOCK_CLASSIFIER.CONFIDENCE_ROUNDING_FACTOR,
    };
  }

  /**
   * Turns a keyword match count into a confidence.
   *
   * Steps:
   * 1. Return a high confidence for a strong match.
   * 2. Return a low confidence for a single match.
   * 3. Return the fixed confidence when nothing matched.
   *
   * @param matches - How many keywords matched.
   * @returns The confidence, before rounding.
   */
  private resolveConfidence(matches: number): number {
    // 1. Return a high confidence for a strong match.
    if (matches >= MOCK_CLASSIFIER.STRONG_MATCH_COUNT) {
      return MOCK_CLASSIFIER.STRONG_CONFIDENCE_FLOOR + this.random() * MOCK_CLASSIFIER.STRONG_CONFIDENCE_SPREAD;
    }

    // 2. Return a low confidence for a single match.
    if (matches === 1) {
      return MOCK_CLASSIFIER.WEAK_CONFIDENCE_FLOOR + this.random() * MOCK_CLASSIFIER.WEAK_CONFIDENCE_SPREAD;
    }

    // 3. Return the fixed confidence when nothing matched.
    return MOCK_CLASSIFIER.NO_MATCH_CONFIDENCE;
  }

  /**
   * Tells whether the title contains any forced-behaviour trigger.
   *
   * @param title - The lower-cased title.
   * @returns `true` when a trigger is present.
   */
  private static hasTrigger(title: string): boolean {
    return Object.values(MOCK_TRIGGER).some((trigger) => title.includes(trigger));
  }

  /**
   * Matches a Latin keyword as a whole word (so "ai" does not match "said") and an Arabic one as a substring.
   *
   * Steps:
   * 1. Match an Arabic keyword as a plain substring.
   * 2. Escape the special characters of a Latin keyword.
   * 3. Match the Latin keyword as a whole word.
   *
   * @param text - The lower-cased text to search.
   * @param keyword - The keyword to look for.
   * @returns `true` when the keyword matches.
   */
  private static isWholeWordMatch(text: string, keyword: string): boolean {
    // 1. Match an Arabic keyword as a plain substring.
    if (MockClassifierDriver.NON_ASCII_PATTERN.test(keyword)) {
      return text.includes(keyword);
    }

    // 2. Escape the special characters of a Latin keyword.
    const escapedKeyword = keyword.replace(MockClassifierDriver.REGEX_SPECIAL_CHARACTERS, "\\$&");

    // 3. Match the Latin keyword as a whole word.
    return new RegExp(`\\b${escapedKeyword}\\b`).test(text);
  }
}
