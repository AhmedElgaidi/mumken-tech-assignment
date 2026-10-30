import { ClassificationKindEnum } from "../../../../../modules/classification/contracts/enums/lifecycle/classification-kind.enum";

/** The values of a reviewer's classification row. */
export interface ManualClassificationRowInterface {
  /** Public id of the record being reviewed. */
  recordId: string;
  /** Which kind of manual result this is. */
  kind: ClassificationKindEnum.MANUAL_CORRECTION | ClassificationKindEnum.MANUAL_APPROVAL;
  /** The category the reviewer chose. */
  categoryCode: string;
  /** Why the category was changed; null for an approval. */
  reason: string | null;
  /** Name of the reviewer. */
  reviewedBy: string;
  /** Public id of the classification this one replaces; null when none. */
  supersedesId: string | null;
}
