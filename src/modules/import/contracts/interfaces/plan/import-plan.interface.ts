import { PlanCandidateInterface } from "./plan-candidate.interface";
import { PlannedItemInterface } from "./planned-item.interface";

/** A validated batch: every item with its outcome so far, and the records to try to store. */
export interface ImportPlanInterface {
  /** Every submitted item, in batch order. */
  items: PlannedItemInterface[];
  /** First valid occurrence of each key, sorted by key so concurrent imports lock in one order. */
  candidates: PlanCandidateInterface[];
}
