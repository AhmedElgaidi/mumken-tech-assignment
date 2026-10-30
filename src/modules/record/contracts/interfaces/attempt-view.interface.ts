/** One classification attempt of a record. */
export interface AttemptViewInterface {
  /** Retry generation the attempt belongs to; 0 for the first run. */
  retryGeneration: number;
  /** Number of the attempt inside its generation, from 1. */
  attemptNo: number;
  /** How the attempt ended. */
  outcome: string;
  /** Error message of a failed attempt; `null` on success. */
  error: string | null;
  /** How long the attempt took, in milliseconds; `null` when not measured. */
  durationMs: number | null;
  /** ISO 8601 UTC time the attempt was recorded. */
  createdAt: string;
}
