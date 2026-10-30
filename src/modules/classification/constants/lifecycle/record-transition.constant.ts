import { RecordStatusEnum } from "../../contracts/enums/lifecycle/record-status.enum";
import { RecordTriggerEnum } from "../../contracts/enums/lifecycle/record-trigger.enum";
import { RecordTransitionInterface } from "../../contracts/interfaces/lifecycle/record-transition.interface";

const { PENDING, PROCESSING, CLASSIFIED, NEEDS_REVIEW, FAILED } = RecordStatusEnum;

/**
 * The single source of truth for record statuses. Repositories build their
 * `classificationStatus = ANY(...)` predicates from `RecordStatusMachineUtil.getFromStatuses`,
 * and a unit test checks this table against the documented state diagram.
 */
export const RECORD_TRANSITIONS: readonly RecordTransitionInterface[] = [
  {
    trigger: RecordTriggerEnum.CLAIM,
    from: [PENDING],
    to: PROCESSING,
    guard: "attemptCount < max",
  },
  {
    trigger: RecordTriggerEnum.RECLAIM_EXPIRED_LEASE,
    from: [PROCESSING],
    to: PROCESSING,
    guard: "lease expired, attemptCount < max",
  },
  {
    trigger: RecordTriggerEnum.EXHAUST_ON_CLAIM,
    from: [PENDING, PROCESSING],
    to: FAILED,
    guard: "no valid lease, attemptCount >= max",
  },
  {
    trigger: RecordTriggerEnum.SUCCEED,
    from: [PROCESSING],
    to: CLASSIFIED,
    guard: "leaseToken = mine",
  },
  {
    trigger: RecordTriggerEnum.SUCCEED_LOW_CONFIDENCE,
    from: [PROCESSING],
    to: NEEDS_REVIEW,
    guard: "leaseToken = mine",
  },
  {
    trigger: RecordTriggerEnum.FAIL_RETRYABLE,
    from: [PROCESSING],
    to: PENDING,
    guard: "leaseToken = mine, attempts left",
  },
  {
    trigger: RecordTriggerEnum.FAIL_EXHAUSTED,
    from: [PROCESSING],
    to: FAILED,
    guard: "leaseToken = mine",
  },
  {
    trigger: RecordTriggerEnum.FAIL_PERMANENT,
    from: [PROCESSING],
    to: FAILED,
    guard: "leaseToken = mine",
  },
  {
    trigger: RecordTriggerEnum.RETRY,
    from: [FAILED],
    to: PENDING,
    guard: "TRANSIENT_EXHAUSTED, or PERMANENT with isForced",
  },
  {
    trigger: RecordTriggerEnum.APPROVE,
    from: [NEEDS_REVIEW],
    to: CLASSIFIED,
    guard: "currentClassificationId = expected",
  },
  {
    trigger: RecordTriggerEnum.CORRECT,
    from: [NEEDS_REVIEW, CLASSIFIED],
    to: CLASSIFIED,
    guard: "currentClassificationId = expected",
  },
  {
    trigger: RecordTriggerEnum.CLASSIFY_MANUALLY,
    from: [FAILED],
    to: CLASSIFIED,
    guard: "currentClassificationId IS NULL",
  },
];

/** Statuses the worker and the sweeper must never send back to the classifier. */
export const TERMINAL_FOR_WORKER: readonly RecordStatusEnum[] = [CLASSIFIED, NEEDS_REVIEW, FAILED];

/** Statuses meaning "classification still running" for progress and the import status. */
export const IN_FLIGHT_STATUSES: readonly RecordStatusEnum[] = [PENDING, PROCESSING];
