import { AttemptViewInterface } from "./attempt-view.interface";

/** The classification attempts of a record, summarised and listed. */
export interface RecordAttemptsInterface {
  /** Attempts across all generations. */
  total: number;
  /** Attempts in the current retry generation. */
  currentGeneration: number;
  /** The last error message of the record; `null` when none. */
  lastError: string | null;
  /** Every attempt, oldest first. */
  items: AttemptViewInterface[];
}
