import { RecordFilterInterface } from "../../../../infrastructure/contracts/interfaces/sql-db/record/record-row.interface";

/** The date bounds of a record filter. */
export type RecordDateRangeType = Pick<RecordFilterInterface, "dateFrom" | "dateToExclusive" | "dateToInclusive">;
