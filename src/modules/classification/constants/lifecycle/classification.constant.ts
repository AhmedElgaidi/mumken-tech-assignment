import { RecordStatusEnum } from "../../contracts/enums/lifecycle/record-status.enum";

/** Every record status, in lifecycle order. */
export const RECORD_STATUSES: readonly RecordStatusEnum[] = Object.values(RecordStatusEnum);

/** Category used when the classifier answers with a code we do not know. */
export const FALLBACK_CATEGORY_CODE = "other";
