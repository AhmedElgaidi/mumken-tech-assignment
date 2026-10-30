import { ImportStatusEnum } from "../../enums/import-status.enum";
import { ProgressFigureInterface } from "./progress-figure.interface";

/** The live status of an import, derived from its items and records. */
export interface ImportProgressInterface {
  /** Derived status; never stored. */
  status: ImportStatusEnum;
  /** When the import finished; `null` while records are still in flight. */
  completedAt: Date | null;
  /** Classification progress. */
  progress: ProgressFigureInterface;
}
