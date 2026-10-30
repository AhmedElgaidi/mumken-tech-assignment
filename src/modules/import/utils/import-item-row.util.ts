import { ImportItemOutcomeEnum } from "../contracts/enums/import-item-outcome.enum";
import {
  ImportItemRowInterface,
  StoredKeyInterface,
} from "../../../infrastructure/contracts/interfaces/sql-db/import/import-row.interface";
import { PlannedItemInterface } from "../contracts/interfaces/plan/planned-item.interface";
import { SubmitImportResponseInterface } from "../contracts/interfaces/response/submit-import-response.interface";
import { ImportPlanUtil } from "./import-plan.util";

/** Builds the stored item rows of an import, and reads duplicate items back out of them. */
export class ImportItemRowUtil {
  /**
   * The stored row of one planned item: INVALID, DUPLICATE_IN_BATCH, ACCEPTED (the record was
   * just inserted) or DUPLICATE_EXISTING (an earlier import stored it). Records the id of every
   * record an item points at, so in-batch duplicates can be linked afterwards.
   *
   * Steps:
   * 1. Return an INVALID row for an invalid item.
   * 2. Build the base row of a valid item.
   * 3. Return a DUPLICATE_IN_BATCH row for a repeated item.
   * 4. Return an ACCEPTED row for a record this import inserted.
   * 5. Find the stored record.
   * 6. Return a DUPLICATE_EXISTING row.
   *
   * @param item - The planned item.
   * @param createdByKey - Records this import inserted, by record key.
   * @param existingByKey - Records found already stored, by record key.
   * @param recordIdByIndex - Filled with the record id of each accepted or existing item.
   * @returns The row to insert.
   * @throws Error when a valid item's record is neither inserted nor found.
   */
  public static buildItemRow(
    item: PlannedItemInterface,
    createdByKey: Map<string, StoredKeyInterface>,
    existingByKey: Map<string, StoredKeyInterface>,
    recordIdByIndex: Map<number, string>,
  ): ImportItemRowInterface {
    // 1. Return an INVALID row for an invalid item.
    const validation = item.validation;
    if (!validation.isValid) {
      return {
        ...ImportItemRowUtil.buildEmptyRow(item.index),
        outcome: ImportItemOutcomeEnum.INVALID,
        externalId: validation.externalId,
        source: validation.source,
        errors: validation.errors,
        warnings: validation.warnings,
      };
    }

    // 2. Build the base row of a valid item.
    const recordKey = ImportPlanUtil.getRecordKey(validation.record);
    const base = {
      ...ImportItemRowUtil.buildEmptyRow(item.index),
      externalId: validation.record.externalId,
      source: validation.record.source,
      warnings: validation.warnings,
    };

    // 3. Return a DUPLICATE_IN_BATCH row for a repeated item.
    if (item.outcome === ImportItemOutcomeEnum.DUPLICATE_IN_BATCH) {
      return {
        ...base,
        outcome: ImportItemOutcomeEnum.DUPLICATE_IN_BATCH,
        duplicateOfIndex: item.duplicateOfIndex,
      };
    }

    // 4. Return an ACCEPTED row for a record this import inserted.
    const createdRow = createdByKey.get(recordKey);
    if (createdRow) {
      recordIdByIndex.set(item.index, createdRow.id);
      return { ...base, outcome: ImportItemOutcomeEnum.ACCEPTED, recordId: createdRow.id };
    }

    // 5. Find the stored record.
    const existing = existingByKey.get(recordKey);
    if (!existing) {
      throw new Error("record neither inserted nor found; the unique key changed under us");
    }

    // 6. Return a DUPLICATE_EXISTING row.
    recordIdByIndex.set(item.index, existing.id);
    return {
      ...base,
      outcome: ImportItemOutcomeEnum.DUPLICATE_EXISTING,
      recordId: existing.id,
      hasContentChanged: existing.contentHash !== validation.record.contentHash,
    };
  }

  /**
   * Points each in-batch duplicate at the record of its first occurrence.
   *
   * @param rows - The item rows, mutated in place.
   * @param recordIdByIndex - Record id of each item that has a record.
   */
  public static linkBatchDuplicates(rows: ImportItemRowInterface[], recordIdByIndex: Map<number, string>): void {
    for (const row of rows) {
      if (row.outcome === ImportItemOutcomeEnum.DUPLICATE_IN_BATCH && row.duplicateOfIndex !== null) {
        row.recordId = recordIdByIndex.get(row.duplicateOfIndex) ?? null;
      }
    }
  }

  /**
   * The duplicate entry of a stored item for the submit response.
   *
   * Steps:
   * 1. Build the entry of an existing duplicate.
   * 2. Build the entry of an in-batch duplicate.
   * 3. Return no entry for any other outcome.
   *
   * @param item - A stored item row.
   * @returns One entry for a duplicate item, none for any other outcome.
   */
  public static buildDuplicateEntries(item: ImportItemRowInterface): SubmitImportResponseInterface["duplicateItems"] {
    // 1. Build the entry of an existing duplicate.
    if (item.outcome === ImportItemOutcomeEnum.DUPLICATE_EXISTING) {
      return [
        {
          index: item.index,
          kind: item.outcome,
          externalId: item.externalId,
          existingRecordId: item.recordId,
          hasContentChanged: item.hasContentChanged ?? false,
        },
      ];
    }

    // 2. Build the entry of an in-batch duplicate.
    if (item.outcome === ImportItemOutcomeEnum.DUPLICATE_IN_BATCH) {
      return [
        {
          index: item.index,
          kind: item.outcome,
          externalId: item.externalId,
          duplicateOfIndex: item.duplicateOfIndex,
        },
      ];
    }

    // 3. Return no entry for any other outcome.
    return [];
  }

  /**
   * A row with every optional field empty, to spread into a concrete outcome.
   *
   * @param index - Zero-based position of the item in the request.
   * @returns The row without its outcome.
   */
  private static buildEmptyRow(index: number): Omit<ImportItemRowInterface, "outcome"> {
    return {
      index,
      externalId: null,
      source: null,
      errors: null,
      warnings: null,
      recordId: null,
      duplicateOfIndex: null,
      hasContentChanged: null,
    };
  }
}
