import { ClassificationKindEnum } from "../../../../../modules/classification/contracts/enums/lifecycle/classification-kind.enum";

/** A stored classification as repositories return it: every id is a public UUID. */
export interface ClassificationRowInterface {
  /** Public id of the classification. */
  id: string;
  /** Public id of the record it is about. */
  recordId: string;
  /** How the result was produced. */
  kind: ClassificationKindEnum;
  /** The category assigned. */
  categoryCode: string;
  /** Confidence from 0 to 1 as pg returns `numeric` (a string); null for manual results. */
  confidence: string | null;
  /** Whether a human must look at the result. */
  isReviewNeeded: boolean;
  /** Name and version of the classifier, for automatic results. */
  classifier: string | null;
  /** The classifier response as received. */
  rawOutput: unknown;
  /** Why a reviewer changed the category. */
  reason: string | null;
  /** Name of the reviewer for manual results. */
  reviewedBy: string | null;
  /** Public id of the classification this one replaces. */
  supersedesId: string | null;
  /** When the row was inserted. */
  createdAt: Date;
}
