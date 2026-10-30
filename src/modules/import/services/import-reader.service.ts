import { HttpStatus, Injectable } from "@nestjs/common";
import { ErrorCodeEnum } from "../../../infrastructure/contracts/enums/http/error-code.enum";
import { ProblemException } from "../../../infrastructure/exceptions/http/problem.exception";
import { API_PREFIX } from "../../../infrastructure/constants/http/api-prefix.constant";
import {
  ImportCountsInterface,
  ImportRowInterface,
} from "../../../infrastructure/contracts/interfaces/sql-db/import/import-row.interface";
import { ImportRepository } from "../../../infrastructure/repositories/import/import.repository";
import { ImportItemOutcomeEnum } from "../contracts/enums/import-item-outcome.enum";
import { ImportDetailResponseInterface } from "../contracts/interfaces/response/import-detail-response.interface";
import { ImportSummaryInterface } from "../contracts/interfaces/response/import-summary.interface";
import { SubmitImportResponseInterface } from "../contracts/interfaces/response/submit-import-response.interface";
import { ImportItemRowUtil } from "../utils/import-item-row.util";
import { ImportStatusUtil } from "../utils/import-status.util";

/** Reads a stored import back and shapes its live status into the HTTP response bodies. */
@Injectable()
export class ImportReaderService {
  public constructor(private readonly importRepository: ImportRepository) {}

  /**
   * Load one import row or fail.
   *
   * Steps:
   * 1. Look up the import row.
   * 2. Throw when it is missing.
   * 3. Return the row.
   *
   * @param importId - The import id.
   * @returns The import row.
   * @throws ProblemException `NOT_FOUND` when the import does not exist.
   */
  public async findImportOrThrow(importId: string): Promise<ImportRowInterface> {
    // 1. Look up the import row.
    const importRow = await this.importRepository.findById(importId);

    // 2. Throw when it is missing.
    if (!importRow) {
      throw new ProblemException(HttpStatus.NOT_FOUND, ErrorCodeEnum.NOT_FOUND, `Import ${importId} was not found`);
    }

    // 3. Return the row.
    return importRow;
  }

  /**
   * The submit response, rebuilt from stored items, so a replay returns the same shape.
   *
   * Steps:
   * 1. Load the import, its items and its counts
   * 2. Derive the live status
   * 3. Shape the response
   *
   * @param importId - The import to describe.
   * @returns The submit response body.
   */
  public async buildSubmitResponse(importId: string): Promise<SubmitImportResponseInterface> {
    // 1. Load the import, its items and its counts
    const [importRow, items, counts] = await Promise.all([
      this.findImportOrThrow(importId),
      this.importRepository.listItems(importId),
      this.importRepository.countByImport(importId),
    ]);
    // 2. Derive the live status
    const derived = ImportStatusUtil.derive({ ...counts, createdAt: importRow.createdAt });
    const importPath = `/${API_PREFIX}/imports/${importId}`;
    // 3. Shape the response
    return {
      id: importId,
      status: derived.status,
      summary: ImportReaderService.buildItemSummary(importRow.totalItems, counts),
      invalidItems: items
        .filter((item) => item.outcome === ImportItemOutcomeEnum.INVALID)
        .map((item) => ({
          index: item.index,
          externalId: item.externalId,
          errors: item.errors ?? [],
        })),
      duplicateItems: items.flatMap((item) => ImportItemRowUtil.buildDuplicateEntries(item)),
      warnings: items.flatMap((item) => (item.warnings ?? []).map((warning) => ({ index: item.index, ...warning }))),
      links: { self: importPath, items: `${importPath}/items` },
    };
  }

  /**
   * The current state of one import.
   *
   * Steps:
   * 1. Load the import row.
   * 2. Count its items and records.
   * 3. Derive the live status.
   * 4. Build the detail response.
   *
   * @param importId - The import id.
   * @returns Its live status, item counts, classification counts and progress.
   * @throws ProblemException `NOT_FOUND` when the import does not exist.
   */
  public async buildDetailResponse(importId: string): Promise<ImportDetailResponseInterface> {
    // 1. Load the import row.
    const importRow = await this.findImportOrThrow(importId);

    // 2. Count its items and records.
    const counts = await this.importRepository.countByImport(importId);

    // 3. Derive the live status.
    const derived = ImportStatusUtil.derive({ ...counts, createdAt: importRow.createdAt });

    // 4. Build the detail response.
    return {
      id: importRow.id,
      status: derived.status,
      createdAt: importRow.createdAt.toISOString(),
      completedAt: derived.completedAt?.toISOString() ?? null,
      items: ImportReaderService.buildItemSummary(importRow.totalItems, counts),
      classification: {
        pending: counts.records.PENDING,
        processing: counts.records.PROCESSING,
        classified: counts.records.CLASSIFIED,
        needsReview: counts.records.NEEDS_REVIEW,
        failed: counts.records.FAILED,
      },
      progress: derived.progress,
    };
  }

  /**
   * The item counts of an import by outcome.
   *
   * @param totalItems - How many items the request carried.
   * @param counts - The live counts of the import.
   * @returns The total and the count of every item outcome.
   */
  private static buildItemSummary(totalItems: number, counts: ImportCountsInterface): ImportSummaryInterface {
    return {
      total: totalItems,
      accepted: counts.items.ACCEPTED,
      invalid: counts.items.INVALID,
      duplicateInBatch: counts.items.DUPLICATE_IN_BATCH,
      duplicateExisting: counts.items.DUPLICATE_EXISTING,
    };
  }
}
