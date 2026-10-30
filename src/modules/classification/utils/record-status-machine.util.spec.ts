import { RECORD_STATUSES } from "../constants/lifecycle/classification.constant";
import { RECORD_TRANSITIONS } from "../constants/lifecycle/record-transition.constant";
import { RecordStatusEnum } from "../contracts/enums/lifecycle/record-status.enum";
import { RecordTriggerEnum } from "../contracts/enums/lifecycle/record-trigger.enum";
import { RecordStatusMachineUtil } from "./record-status-machine.util";

const { PENDING, PROCESSING, CLASSIFIED, NEEDS_REVIEW, FAILED } = RecordStatusEnum;

/** The documented state diagram (docs/ARCHITECTURE.md, "Record states"). */
const ALLOWED: Array<[RecordStatusEnum, RecordStatusEnum]> = [
  [PENDING, PROCESSING],
  [PROCESSING, PROCESSING],
  [PENDING, FAILED],
  [PROCESSING, FAILED],
  [PROCESSING, CLASSIFIED],
  [PROCESSING, NEEDS_REVIEW],
  [PROCESSING, PENDING],
  [FAILED, PENDING],
  [FAILED, CLASSIFIED],
  [NEEDS_REVIEW, CLASSIFIED],
  [CLASSIFIED, CLASSIFIED],
];

describe("record status machine", () => {
  it.each(RECORD_STATUSES.flatMap((from) => RECORD_STATUSES.map((to) => [from, to] as const)))(
    "%s → %s matches the diagram",
    (from, to) => {
      const isExpected = ALLOWED.some(([a, b]) => a === from && b === to);
      expect(RecordStatusMachineUtil.canTransition(from, to)).toBe(isExpected);
    },
  );

  it("never sends a successful record back to the classifier", () => {
    for (const status of [CLASSIFIED, NEEDS_REVIEW]) {
      expect(RecordStatusMachineUtil.canTransition(status, PENDING)).toBe(false);
      expect(RecordStatusMachineUtil.canTransition(status, PROCESSING)).toBe(false);
    }
  });

  it("builds the SQL predicates of each statement from the table", () => {
    expect(RecordStatusMachineUtil.getFromStatuses(RecordTriggerEnum.CLAIM)).toEqual([PENDING]);
    expect(RecordStatusMachineUtil.getFromStatuses(RecordTriggerEnum.RETRY)).toEqual([FAILED]);
    expect(RecordStatusMachineUtil.getFromStatuses(RecordTriggerEnum.CORRECT)).toEqual([NEEDS_REVIEW, CLASSIFIED]);
    expect(new Set(RECORD_TRANSITIONS.map((t) => t.trigger)).size).toBe(RECORD_TRANSITIONS.length);
  });
});
