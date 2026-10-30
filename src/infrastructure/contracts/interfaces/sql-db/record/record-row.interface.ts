import { FailureKindEnum } from "../../../../../modules/classification/contracts/enums/lifecycle/failure-kind.enum";
import { RecordStatusEnum } from "../../../../../modules/classification/contracts/enums/lifecycle/record-status.enum";

/** A stored record as repositories return it: every id is a public UUID. */
export interface RecordRowInterface {
  /** Public id of the record. */
  id: string;
  /** The source system's id for the record. */
  externalId: string;
  /** Source system name, as supplied. */
  source: string;
  /** Headline. */
  title: string;
  /** Body text. */
  description: string;
  /** Publication or effective date. */
  recordDate: Date;
  /** Where the record is in the state machine. */
  classificationStatus: RecordStatusEnum;
  /** Why the record failed; null unless FAILED. */
  failureKind: FailureKindEnum | null;
  /** Category of the current classification. */
  currentCategoryCode: string | null;
  /** Public id of the current classification. */
  currentClassificationId: string | null;
  /** Confidence of the current classification as pg returns `numeric` (a string). */
  currentConfidence: string | null;
  /** The record's retry generation. */
  retryGeneration: number;
  /** Message of the latest failed attempt. */
  lastError: string | null;
  /** When the record reached a final-for-now status. */
  finishedAt: Date | null;
  /** Public id of the import that created the record. */
  importId: string;
  /** When the record was created. */
  createdAt: Date;
}

/** Optional filters of the record list. */
export interface RecordFilterInterface {
  /** Lowercased source name to match. */
  sourceKey?: string;
  /** Category code to match. */
  category?: string;
  /** Statuses to match. */
  statuses?: RecordStatusEnum[];
  /** Earliest record date, inclusive. */
  dateFrom?: Date;
  /** Latest record date, exclusive. */
  dateToExclusive?: Date;
  /** Latest record date, inclusive. */
  dateToInclusive?: Date;
  /** Public id of the import to match. */
  importId?: string;
  /** Escaped `ILIKE` pattern for the title. */
  titleLike?: string;
}
