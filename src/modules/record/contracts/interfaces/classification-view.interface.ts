import { ClassificationKindEnum } from "../../../classification/contracts/enums/lifecycle/classification-kind.enum";

/** One classification of a record as the API shows it. */
export interface ClassificationViewInterface {
  /** Id of the classification. */
  id: string;
  /** How it came about: automatic, manual approval or manual correction. */
  kind: ClassificationKindEnum;
  /** Code of the category it assigns. */
  categoryCode: string;
  /** Classifier confidence from 0 to 1; `null` for a manual classification. */
  confidence: number | null;
  /** True when the classifier asked for a human review. */
  isReviewNeeded: boolean;
  /** Name of the classifier; `null` for a manual classification. */
  classifier: string | null;
  /** Unprocessed classifier output, kept for audit; `null` for a manual classification. */
  rawOutput: unknown;
  /** Why a reviewer corrected it; `null` otherwise. */
  reason: string | null;
  /** The reviewer who approved or corrected it; `null` for an automatic one. */
  reviewedBy: string | null;
  /** Id of the classification this one replaced; `null` for the first. */
  supersedesId: string | null;
  /** ISO 8601 UTC time it was created. */
  createdAt: string;
}
