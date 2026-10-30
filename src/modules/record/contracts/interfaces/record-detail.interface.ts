import { ClassificationViewInterface } from "./classification-view.interface";
import { RecordAttemptsInterface } from "./record-attempts.interface";
import { RecordListItemInterface } from "./record-list-item.interface";

/** One record with its description, classification history and attempts. */
export interface RecordDetailInterface extends RecordListItemInterface {
  /** Full text the classifier read. */
  description: string;
  /** Current retry generation; 0 until the record is retried. */
  retryGeneration: number;
  /** Last classification error; `null` when none. */
  lastError: string | null;
  /** ISO 8601 UTC time classification finished; `null` while in flight. */
  finishedAt: string | null;
  /** The current classification; `null` until classified. */
  classification: ClassificationViewInterface | null;
  /** The first automatic classification; `null` until there is one. */
  originalClassification: ClassificationViewInterface | null;
  /** Every classification, oldest first. */
  history: ClassificationViewInterface[];
  /** The classification attempts. */
  attempts: RecordAttemptsInterface;
}
