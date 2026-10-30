import { Injectable, Logger } from "@nestjs/common";
import { StoredKeyInterface } from "../../../infrastructure/contracts/interfaces/sql-db/import/import-row.interface";
import { ImportRepository } from "../../../infrastructure/repositories/import/import.repository";
import { POSTGRES_ERROR_CODE } from "../../../infrastructure/constants/sql-db/postgres-error-code.constant";
import { TransactionHelper } from "../../../infrastructure/helpers/sql-db/transaction.helper";
import { PostgresErrorUtil } from "../../../infrastructure/utils/sql-db/postgres-error.util";
import { ImportPlanInterface } from "../contracts/interfaces/plan/import-plan.interface";
import { StoredImportInterface } from "../contracts/interfaces/store/stored-import.interface";
import { ImportItemRowUtil } from "../utils/import-item-row.util";
import { ImportPlanUtil } from "../utils/import-plan.util";

/** Persists a planned import in one transaction, retrying once when the database reports a deadlock. */
@Injectable()
export class ImportStorageService {
  /** A deadlock is retried this many times; row keys are sorted, so a deadlock is a backstop case. */
  private static readonly MAX_DEADLOCK_RETRIES = 1;

  private readonly logger = new Logger(ImportStorageService.name);

  public constructor(private readonly importRepository: ImportRepository) {}

  /**
   * Stores the import in one transaction; retried once on a deadlock (keys are sorted, so this
   * is a backstop).
   *
   * @param plan - The validated batch.
   * @param key - The idempotency key, or `null`.
   * @param requestHash - Canonical hash of the submitted batch.
   * @returns The new import id and the records it created.
   */
  public async store(
    plan: ImportPlanInterface,
    key: string | null,
    requestHash: string,
  ): Promise<StoredImportInterface> {
    for (let retryCount = 0; ; retryCount += 1) {
      try {
        return await this.storeInTransaction(plan, key, requestHash);
      } catch (error) {
        const canRetry =
          retryCount < ImportStorageService.MAX_DEADLOCK_RETRIES &&
          PostgresErrorUtil.getCode(error) === POSTGRES_ERROR_CODE.DEADLOCK_DETECTED;
        if (!canRetry) {
          throw error;
        }
        this.logger.warn({ event: "import.deadlock-retry" }, "deadlock while storing an import; retrying once");
      }
    }
  }

  /**
   * Stores the import, its new records and one row per submitted item in one transaction.
   * Records that already exist (from an earlier import) are looked up so their items point at
   * them; an in-batch duplicate points at the record of its first occurrence.
   *
   * Steps:
   * 1. Create the import row
   * 2. Insert the new records
   * 3. Look up the records that already existed
   * 4. Build one row per item
   * 5. Point in-batch duplicates at their first record
   * 6. Insert the item rows
   *
   * @param plan - The validated batch.
   * @param key - The idempotency key, or `null`.
   * @param requestHash - Canonical hash of the submitted batch.
   * @returns The new import id and the records it created.
   */
  private async storeInTransaction(
    plan: ImportPlanInterface,
    key: string | null,
    requestHash: string,
  ): Promise<StoredImportInterface> {
    const transaction = await this.importRepository.createTransaction();
    try {
      // 1. Create the import row
      const importId = await this.importRepository.createImport(transaction, {
        idempotencyKey: key,
        requestHash,
        totalItems: plan.items.length,
      });
      // 2. Insert the new records
      const createdRecords = await this.importRepository.insertRecords(
        transaction,
        importId,
        plan.candidates.map((candidate) => candidate.record),
      );
      const createdByKey = ImportStorageService.indexByRecordKey(createdRecords);
      // 3. Look up the records that already existed
      const missingRecords = plan.candidates
        .filter((candidate) => !createdByKey.has(ImportPlanUtil.getRecordKey(candidate.record)))
        .map((candidate) => candidate.record);
      const existingRecords = await this.importRepository.findRecordsByKeys(transaction, missingRecords);
      const existingByKey = ImportStorageService.indexByRecordKey(existingRecords);
      // 4. Build one row per item
      const recordIdByIndex = new Map<number, string>();
      const itemRows = plan.items.map((item) =>
        ImportItemRowUtil.buildItemRow(item, createdByKey, existingByKey, recordIdByIndex),
      );
      // 5. Point in-batch duplicates at their first record
      ImportItemRowUtil.linkBatchDuplicates(itemRows, recordIdByIndex);
      // 6. Insert the item rows
      await this.importRepository.insertItems(transaction, importId, itemRows);
      await transaction.commit();
      return { importId, created: createdRecords.map((record) => ({ recordId: record.id })) };
    } catch (error) {
      await TransactionHelper.rollbackQuietly(transaction);
      throw error;
    }
  }

  /**
   * Indexes stored records by their `(sourceKey, externalId)` identity.
   *
   * @param records - The stored records.
   * @returns The records by record key.
   */
  private static indexByRecordKey(records: StoredKeyInterface[]): Map<string, StoredKeyInterface> {
    return new Map(records.map((record) => [ImportPlanUtil.getRecordKey(record), record]));
  }
}
