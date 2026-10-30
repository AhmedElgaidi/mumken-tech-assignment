import { AttemptOutcomeEnum } from "../../../../../modules/classification/contracts/enums/lifecycle/attempt-outcome.enum";

/** A stored classification attempt as repositories return it. */
export interface ClassificationAttemptRowInterface {
  /** The record's retry generation when the attempt ran. */
  retryGeneration: number;
  /** Position of the attempt within its retry generation. */
  attemptNo: number;
  /** How the attempt ended. */
  outcome: AttemptOutcomeEnum;
  /** Error message of a failed attempt. */
  error: string | null;
  /** How long the classifier call took, in milliseconds. */
  durationMs: number | null;
  /** When the attempt was recorded. */
  createdAt: Date;
}
