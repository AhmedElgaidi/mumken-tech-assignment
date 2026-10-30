/** Deterministic triggers in the title, for demos and tests. */
export const MOCK_TRIGGER = {
  /** Always fails with a retryable error. */
  FAIL_TRANSIENT: "[fail-transient]",
  /** Fails with a retryable error on the first attempt only. */
  FAIL_ONCE: "[fail-once]",
  /** Always fails with a non-retryable error. */
  FAIL_PERMANENT: "[fail-permanent]",
  /** Forces a low confidence so the record lands in review. */
  REVIEW: "[review]",
  /** Answers with a category code that does not exist. */
  UNKNOWN_CATEGORY: "[unknown-category]",
} as const;
