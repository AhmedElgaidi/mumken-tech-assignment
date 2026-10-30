import { FailureKindEnum } from "../../../classification/contracts/enums/lifecycle/failure-kind.enum";
import { RecordStatusEnum } from "../../../classification/contracts/enums/lifecycle/record-status.enum";

/** One record in the record list. */
export interface RecordListItemInterface {
  /** Id of the record. */
  id: string;
  /** The record's id in its source system. */
  externalId: string;
  /** The source as submitted. */
  source: string;
  /** Title of the record. */
  title: string;
  /** ISO 8601 UTC publication or effective date. */
  date: string;
  /** Where the record is in classification. */
  classificationStatus: RecordStatusEnum;
  /** Why classification failed; `null` unless the status is FAILED. */
  failureKind: FailureKindEnum | null;
  /** Code of the current category; `null` until classified. */
  category: string | null;
  /** Confidence of the current classification from 0 to 1; `null` when none or manual. */
  confidence: number | null;
  /** Id of the current classification; `null` until classified. */
  currentClassificationId: string | null;
  /** Id of the import that created the record. */
  importId: string;
  /** ISO 8601 UTC time the record was created. */
  createdAt: string;
}
