import { ValidRecordInterface } from "../item/valid-record.interface";

/** The first valid occurrence of a record key in a batch. */
export interface PlanCandidateInterface {
  /** Zero-based position of the item in the submitted batch. */
  index: number;
  /** The normalised record to store. */
  record: ValidRecordInterface;
}
