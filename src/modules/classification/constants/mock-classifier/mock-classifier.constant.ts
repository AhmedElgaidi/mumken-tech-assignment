/** Latency, failure and scoring knobs of the mock classifier. Every confidence is a fraction between 0 and 1. */
export const MOCK_CLASSIFIER = {
  /** Version tag reported as the classifier name. */
  NAME: "mock-v1",
  /** Fastest answer, in milliseconds. */
  MIN_LATENCY_MS: 200,
  /** Slowest answer, in milliseconds. */
  MAX_LATENCY_MS: 1500,
  /** Share (0 to 1) of calls that fail transiently at random, to exercise retries. */
  FAILURE_RATE: 0.1,
  /** Seed of the random source, so runs are reproducible. */
  SEED: 42,
  /** Keyword matches from which an answer counts as a strong match. */
  STRONG_MATCH_COUNT: 2,
  /** Lowest confidence of a strong match. */
  STRONG_CONFIDENCE_FLOOR: 0.85,
  /** Random spread added above the strong-match floor. */
  STRONG_CONFIDENCE_SPREAD: 0.14,
  /** Lowest confidence of a single-keyword match. */
  WEAK_CONFIDENCE_FLOOR: 0.5,
  /** Random spread added above the single-keyword floor. */
  WEAK_CONFIDENCE_SPREAD: 0.19,
  /** Confidence when no keyword matched and the fallback category is returned. */
  NO_MATCH_CONFIDENCE: 0.3,
  /** Confidence forced by the review trigger. */
  REVIEW_CONFIDENCE: 0.4,
  /** Confidence of the answer produced by the unknown-category trigger. */
  UNKNOWN_CATEGORY_CONFIDENCE: 0.9,
  /** Category code that is deliberately absent from the category list. */
  UNKNOWN_CATEGORY_CODE: "astrology",
  /** Multiplier that rounds a confidence to three decimals. */
  CONFIDENCE_ROUNDING_FACTOR: 1000,
} as const;
