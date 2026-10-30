import { ImportStatusEnum } from "../../enums/import-status.enum";
import { ImportClassificationCountsInterface } from "./import-classification-counts.interface";
import { ImportSummaryInterface } from "./import-summary.interface";
import { ProgressFigureInterface } from "../status/progress-figure.interface";

/** The current state of one import. */
export interface ImportDetailResponseInterface {
  /** Id of the import. */
  id: string;
  /** Live status. */
  status: ImportStatusEnum;
  /** ISO 8601 UTC time the import was created. */
  createdAt: string;
  /** ISO 8601 UTC time the import finished; `null` while records are in flight. */
  completedAt: string | null;
  /** Item counts by outcome. */
  items: ImportSummaryInterface;
  /** Counts of the created records by classification status. */
  classification: ImportClassificationCountsInterface;
  /** Classification progress. */
  progress: ProgressFigureInterface;
}
