import { ItemCountsType, RecordCountsType } from "../../types/import-count.type";

/** What the live import status is derived from. */
export interface ImportStatusInputInterface {
  /** Item counts by outcome. */
  items: ItemCountsType;
  /** Counts of the records the import created, by classification status. */
  records: RecordCountsType;
  /** When the last of the import's records finished; `null` when none has. */
  latestFinishedAt: Date | null;
  /** When the import was created; the completion time of an import that created no records. */
  createdAt: Date;
}
