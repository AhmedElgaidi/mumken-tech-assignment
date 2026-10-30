import { StoredRecordInterface } from "./stored-record.interface";

/** What one committed import transaction produced. */
export interface StoredImportInterface {
  /** Id of the new import. */
  importId: string;
  /** Records the import created, in insert order; duplicates are not listed. */
  created: StoredRecordInterface[];
}
