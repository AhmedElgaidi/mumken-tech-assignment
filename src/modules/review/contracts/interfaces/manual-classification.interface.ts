import { ClassificationKindEnum } from "../../../classification/contracts/enums/lifecycle/classification-kind.enum";
import { RecordStatusEnum } from "../../../classification/contracts/enums/lifecycle/record-status.enum";

/** A manual classification to store and apply to its record. */
export interface ManualClassificationInterface {
  /** The record being reviewed. */
  recordId: string;
  /** Approval or correction. */
  kind: ClassificationKindEnum.MANUAL_APPROVAL | ClassificationKindEnum.MANUAL_CORRECTION;
  /** Code of the category to assign. */
  categoryCode: string;
  /** The reviewer's reason; `null` for an approval. */
  reason: string | null;
  /** Name of the reviewer. */
  reviewedBy: string;
  /** Id of the classification this one replaces; `null` when the record has none. */
  supersedesId: string | null;
  /** The current classification id the update must still find on the record; `null` when none. */
  expectedCurrentClassificationId: string | null;
  /** Statuses the record may be in for the update to apply. */
  allowedFrom: RecordStatusEnum[];
}
