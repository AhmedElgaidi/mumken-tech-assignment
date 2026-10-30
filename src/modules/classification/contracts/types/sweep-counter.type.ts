import { SweepReportInterface } from "../interfaces/worker/sweep-report.interface";

/** Report counters a recovered record can raise (`scanned` is raised for every record). */
export type SweepCounterType = Exclude<keyof SweepReportInterface, "scanned">;
