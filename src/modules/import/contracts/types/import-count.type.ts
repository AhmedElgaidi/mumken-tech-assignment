import { RecordStatusEnum } from "../../../classification/contracts/enums/lifecycle/record-status.enum";
import { ImportItemOutcomeEnum } from "../enums/import-item-outcome.enum";

/** Count of items per outcome. */
export type ItemCountsType = Record<ImportItemOutcomeEnum, number>;

/** Count of records per classification status. */
export type RecordCountsType = Record<RecordStatusEnum, number>;
