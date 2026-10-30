import { RECORD_TRANSITIONS } from "../constants/lifecycle/record-transition.constant";
import { RecordStatusEnum } from "../contracts/enums/lifecycle/record-status.enum";
import { RecordTriggerEnum } from "../contracts/enums/lifecycle/record-trigger.enum";

/** Reads `RECORD_TRANSITIONS`: the statuses a trigger applies to, and whether a move exists. */
export class RecordStatusMachineUtil {
  /**
   * Lists the statuses a record may be in for a trigger to apply.
   *
   * Steps:
   * 1. Find the transition row of the trigger.
   * 2. Throw when the trigger has no row.
   * 3. Return a copy of the source statuses.
   *
   * @param trigger - The event whose source statuses are wanted.
   * @returns A copy of the trigger's `from` statuses.
   * @throws Error When the trigger has no row in `RECORD_TRANSITIONS`.
   */
  public static getFromStatuses(trigger: RecordTriggerEnum): RecordStatusEnum[] {
    // 1. Find the transition row of the trigger.
    const transition = RECORD_TRANSITIONS.find((candidate) => candidate.trigger === trigger);

    // 2. Throw when the trigger has no row.
    if (!transition) {
      throw new Error(`unknown trigger ${trigger}`);
    }

    // 3. Return a copy of the source statuses.
    return [...transition.from];
  }

  /**
   * Tells whether any trigger moves a record from one status to another.
   *
   * @param from - The status the record is in.
   * @param to - The status it would move to.
   * @returns `true` when some transition leads from `from` to `to`.
   */
  public static canTransition(from: RecordStatusEnum, to: RecordStatusEnum): boolean {
    return RECORD_TRANSITIONS.some((transition) => transition.to === to && transition.from.includes(from));
  }
}
