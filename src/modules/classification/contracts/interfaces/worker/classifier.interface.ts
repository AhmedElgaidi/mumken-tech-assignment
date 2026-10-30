/** What the classifier sees. `attemptNo` lets a stateless mock fail on the first try only. */
export interface ClassifierInputInterface {
  /** Title of the record. */
  title: string;
  /** Free-text description of the record; may be empty. */
  description: string;
  /** Where the record came from. */
  source: string;
  /** ISO 8601 date of the record. */
  date: string;
  /** Which attempt this is, starting at 1. */
  attemptNo: number;
}

/**
 * What a classifier answers. The worker validates it: a confidence outside 0..1 is a permanent
 * failure and an unknown category code sends the record to review as the fallback category.
 */
export interface ClassifierResultInterface {
  /** Code of the chosen category. */
  categoryCode: string;
  /** Certainty of the answer, from 0 (none) to 1 (full). */
  confidence: number;
  /** Provider answer kept for audit; omit when there is nothing beyond the fields above. */
  raw?: unknown;
}

/**
 * A classification provider (mock today, an LLM later). Implementations must honour `signal`
 * so a timeout cancels the call, and signal failures with the error classes below.
 */
export interface ClassifierInterface {
  /** Provider name and version, stored with every result. */
  readonly name: string;
  /**
   * Classifies one record.
   *
   * @param input - The record to classify.
   * @param signal - Aborts the call when the worker's timeout fires.
   * @returns The chosen category and its confidence.
   */
  classify(input: ClassifierInputInterface, signal: AbortSignal): Promise<ClassifierResultInterface>;
}
