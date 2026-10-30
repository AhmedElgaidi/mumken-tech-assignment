import { RecordStatusEnum } from "../../enums/lifecycle/record-status.enum";
import { RecordTriggerEnum } from "../../enums/lifecycle/record-trigger.enum";

/**
 * One allowed move of the record status machine: a trigger takes a record from any of the `from`
 * statuses to `to`. The table of these is `RECORD_TRANSITIONS`.
 */
export interface RecordTransitionInterface {
  /** The event that causes the move. */
  trigger: RecordTriggerEnum;
  /** Statuses a record may be in for the trigger to apply. */
  from: readonly RecordStatusEnum[];
  /** Status the record ends in. */
  to: RecordStatusEnum;
  /** The extra condition each SQL statement adds (documentation; the SQL enforces it). */
  guard: string;
}
