import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { CursorUtil } from "../../../infrastructure/utils/http/cursor.util";
import { HashHelper } from "../../../infrastructure/helpers/crypto/hash.helper";
import { ErrorCodeEnum } from "../../../infrastructure/contracts/enums/http/error-code.enum";
import { PageInterface } from "../../../infrastructure/contracts/interfaces/http/page.interface";
import { ProblemException } from "../../../infrastructure/exceptions/http/problem.exception";
import { ImportItemRowInterface } from "../../../infrastructure/contracts/interfaces/sql-db/import/import-row.interface";
import { ImportRepository } from "../../../infrastructure/repositories/import/import.repository";
import { ClassificationJobService } from "../../classification/services/classification-job.service";
import { DEFAULT_IMPORT_ITEM_PAGE_SIZE } from "../constants/import-query.constant";
import { ListImportItemQueryDto } from "../contracts/dtos/list-import-item-query.dto";
import { ImportDetailResponseInterface } from "../contracts/interfaces/response/import-detail-response.interface";
import { SubmitImportResponseInterface } from "../contracts/interfaces/response/submit-import-response.interface";
import { ImportItemQueryHelper } from "../helpers/import-item-query.helper";
import { RecordValidationHelper } from "../helpers/record-validation.helper";
import { StoredImportInterface } from "../contracts/interfaces/store/stored-import.interface";
import { ImportPlanUtil } from "../utils/import-plan.util";
import { APP_SETTINGS } from "../../../infrastructure/constants/settings/app-settings.token";
import { AppSettingsInterface } from "../../../infrastructure/contracts/interfaces/settings/app-settings.interface";
import { ServiceResultInterface } from "../../../infrastructure/contracts/interfaces/http/service-result.interface";
import { ServiceResultUtil } from "../../../infrastructure/utils/http/service-result.util";
import { ImportIdempotencyService } from "./import-idempotency.service";
import { ImportReaderService } from "./import-reader.service";
import { ImportStorageService } from "./import-storage.service";

/**
 * Accepts batches: validate per item, dedupe, store in one transaction, enqueue after commit.
 * Reads the stored import back as a live status derived from its items and records.
 */
@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  public constructor(
    private readonly importRepository: ImportRepository,
    private readonly importIdempotencyService: ImportIdempotencyService,
    private readonly importStorageService: ImportStorageService,
    private readonly importReaderService: ImportReaderService,
    private readonly classificationJobService: ClassificationJobService,
    @Inject(APP_SETTINGS) private readonly settings: AppSettingsInterface,
  ) {}

  /**
   * Submits a batch. With an `Idempotency-Key`, the same key and body replays the first
   * result (no new work) and the same key with a different body is rejected with 422. A
   * concurrent request that committed the same key first is replayed too. Records are queued
   * only after the import transaction commits.
   *
   * Steps:
   * 1. Check the batch size
   * 2. Check the idempotency key
   * 3. Replay a known key
   * 4. Validate and plan every item
   * 5. Store the import
   * 6. Enqueue the created records
   * 7. Build the response
   *
   * @param records - The submitted items, unvalidated.
   * @param idempotencyKey - The `Idempotency-Key` header, if any.
   * @param requestId - The request id carried into logs and queue jobs.
   * @returns The response body, flagged `isReplayed` when an earlier import was returned.
   * @throws ProblemException `TOO_MANY_RECORDS`, `INVALID_IDEMPOTENCY_KEY` or `IDEMPOTENCY_KEY_REUSED`.
   */
  public async submit(
    records: unknown[],
    idempotencyKey: string | undefined,
    requestId?: string,
  ): Promise<ServiceResultInterface<SubmitImportResponseInterface>> {
    // 1. Check the batch size
    this.assertBatchSize(records);
    // 2. Check the idempotency key
    const key = this.importIdempotencyService.parseKey(idempotencyKey);
    const requestHash = HashHelper.hashJson(records);
    this.logger.log({ requestId, total: records.length, event: "import.received" }, "import received");
    // 3. Replay a known key
    const knownReplay = await this.importIdempotencyService.findReplay(key, requestHash);
    if (knownReplay) {
      return knownReplay;
    }
    // 4. Validate and plan every item
    const plan = ImportPlanUtil.planImport(records.map((raw) => RecordValidationHelper.validate(raw)));
    // 5. Store the import
    let storedImport: StoredImportInterface;
    try {
      storedImport = await this.importStorageService.store(plan, key, requestHash);
    } catch (error) {
      const concurrentReplay = await this.importIdempotencyService.findConcurrentReplay(error, key, requestHash);
      if (concurrentReplay) {
        return concurrentReplay;
      }
      throw error;
    }
    this.logger.log(
      {
        requestId,
        importId: storedImport.importId,
        created: storedImport.created.length,
        event: "import.stored",
      },
      "import stored",
    );
    // 6. Enqueue the created records
    await this.classificationJobService.enqueue(
      storedImport.created.map((record) => ({ recordId: record.recordId, generation: 0 })),
      requestId,
    );
    // 7. Build the response
    return ServiceResultUtil.of(await this.importReaderService.buildSubmitResponse(storedImport.importId));
  }

  /**
   * The current state of one import.
   *
   * @param importId - The import id.
   * @returns Its live status, item counts, classification counts and progress.
   * @throws ProblemException `NOT_FOUND` when the import does not exist.
   */
  public async get(importId: string): Promise<ImportDetailResponseInterface> {
    return this.importReaderService.buildDetailResponse(importId);
  }

  /**
   * One keyset page of an import's items, in batch order.
   *
   * Steps:
   * 1. Check the import exists.
   * 2. Read the filter, cursor and page size.
   * 3. Fetch one row more than the page size.
   * 4. Build the page and its next cursor.
   *
   * @param importId - The import id.
   * @param query - Optional outcome filter, cursor and page size.
   * @returns The page and the cursor of the next one (`null` on the last page).
   * @throws ProblemException `NOT_FOUND`, `INVALID_FILTER` for an unknown outcome, or `INVALID_CURSOR`.
   */
  public async listItems(
    importId: string,
    query: ListImportItemQueryDto,
  ): Promise<PageInterface<ImportItemRowInterface>> {
    // 1. Check the import exists.
    await this.importReaderService.findImportOrThrow(importId);

    // 2. Read the filter, cursor and page size.
    const outcomes = query.outcome ? ImportItemQueryHelper.parseOutcomes(query.outcome) : undefined;
    const afterIndex = query.cursor ? ImportItemQueryHelper.decodeCursor(query.cursor) : undefined;
    const pageSize = query.limit ?? DEFAULT_IMPORT_ITEM_PAGE_SIZE;

    // 3. Fetch one row more than the page size.
    const rows = await this.importRepository.listItems(importId, {
      outcomes,
      afterIndex,
      limit: pageSize + 1,
    });

    // 4. Build the page and its next cursor.
    const pageRows = rows.slice(0, pageSize);
    const lastRow = pageRows.at(-1);
    return {
      data: pageRows,
      nextCursor: rows.length > pageSize && lastRow ? CursorUtil.encode({ index: lastRow.index }) : null,
    };
  }

  /**
   * Rejects a batch larger than the configured maximum.
   *
   * @param records - The submitted items.
   * @throws ProblemException `TOO_MANY_RECORDS` when the batch is too large.
   */
  private assertBatchSize(records: unknown[]): void {
    const maxRecords = this.settings.import.maxRecords;
    if (records.length > maxRecords) {
      throw new ProblemException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCodeEnum.TOO_MANY_RECORDS,
        `A batch may contain at most ${maxRecords} records; split it into smaller imports`,
        { maxRecords },
      );
    }
  }
}
