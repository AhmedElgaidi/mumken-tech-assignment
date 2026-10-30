import { HttpStatus } from "@nestjs/common";
import { API_PREFIX } from "../../../infrastructure/constants/http/api-prefix.constant";
import { ErrorCodeEnum } from "../../../infrastructure/contracts/enums/http/error-code.enum";
import {
  ImportCountsInterface,
  ImportItemRowInterface,
  ImportRowInterface,
} from "../../../infrastructure/contracts/interfaces/sql-db/import/import-row.interface";
import { ProblemException } from "../../../infrastructure/exceptions/http/problem.exception";
import { ImportRepository } from "../../../infrastructure/repositories/import/import.repository";
import { RecordStatusEnum } from "../../classification/contracts/enums/lifecycle/record-status.enum";
import { ImportItemOutcomeEnum } from "../contracts/enums/import-item-outcome.enum";
import { ImportStatusEnum } from "../contracts/enums/import-status.enum";
import { ImportReaderService } from "./import-reader.service";

describe("ImportReaderService", () => {
  const importId = "imp-1";
  const createdAt = new Date("2026-10-25T10:00:00Z");
  const finishedAt = new Date("2026-10-25T10:05:00Z");
  const importRow: ImportRowInterface = {
    id: importId,
    idempotencyKey: null,
    requestHash: null,
    totalItems: 4,
    createdAt,
  };

  const buildCounts = (
    items: Partial<Record<ImportItemOutcomeEnum, number>>,
    records: Partial<Record<RecordStatusEnum, number>>,
    latestFinishedAt: Date | null = null,
  ): ImportCountsInterface => ({
    items: {
      [ImportItemOutcomeEnum.ACCEPTED]: 0,
      [ImportItemOutcomeEnum.INVALID]: 0,
      [ImportItemOutcomeEnum.DUPLICATE_IN_BATCH]: 0,
      [ImportItemOutcomeEnum.DUPLICATE_EXISTING]: 0,
      ...items,
    },
    records: {
      [RecordStatusEnum.PENDING]: 0,
      [RecordStatusEnum.PROCESSING]: 0,
      [RecordStatusEnum.CLASSIFIED]: 0,
      [RecordStatusEnum.NEEDS_REVIEW]: 0,
      [RecordStatusEnum.FAILED]: 0,
      ...records,
    },
    latestFinishedAt,
  });

  const buildItem = (overrides: Partial<ImportItemRowInterface>): ImportItemRowInterface => ({
    index: 0,
    outcome: ImportItemOutcomeEnum.ACCEPTED,
    externalId: null,
    source: null,
    errors: null,
    warnings: null,
    recordId: null,
    duplicateOfIndex: null,
    hasContentChanged: null,
    ...overrides,
  });

  let repository: { findById: jest.Mock; listItems: jest.Mock; countByImport: jest.Mock };
  let service: ImportReaderService;

  beforeEach(() => {
    repository = { findById: jest.fn(), listItems: jest.fn(), countByImport: jest.fn() };
    service = new ImportReaderService(repository as unknown as ImportRepository);
  });

  describe("findImportOrThrow", () => {
    it("returns the row when the import exists", async () => {
      repository.findById.mockResolvedValue(importRow);
      await expect(service.findImportOrThrow(importId)).resolves.toBe(importRow);
    });

    it("throws NOT_FOUND (404) when the import is missing", async () => {
      repository.findById.mockResolvedValue(null);

      const failure: unknown = await service.findImportOrThrow(importId).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ProblemException);
      expect((failure as ProblemException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect((failure as ProblemException).code).toBe(ErrorCodeEnum.NOT_FOUND);
    });
  });

  describe("buildSubmitResponse", () => {
    it("shapes the summary, invalid items, duplicates, warnings and links", async () => {
      const warning = { code: "W", field: "title", message: "warn" };
      const errors = [{ field: "date", code: "E", message: "bad" }];
      repository.findById.mockResolvedValue(importRow);
      repository.countByImport.mockResolvedValue(
        buildCounts(
          {
            [ImportItemOutcomeEnum.ACCEPTED]: 1,
            [ImportItemOutcomeEnum.INVALID]: 1,
            [ImportItemOutcomeEnum.DUPLICATE_IN_BATCH]: 1,
            [ImportItemOutcomeEnum.DUPLICATE_EXISTING]: 1,
          },
          { [RecordStatusEnum.PENDING]: 1 },
        ),
      );
      repository.listItems.mockResolvedValue([
        buildItem({ index: 0, outcome: ImportItemOutcomeEnum.ACCEPTED, externalId: "a", warnings: [warning] as never }),
        buildItem({ index: 1, outcome: ImportItemOutcomeEnum.INVALID, externalId: "b", errors: errors as never }),
        buildItem({
          index: 2,
          outcome: ImportItemOutcomeEnum.DUPLICATE_IN_BATCH,
          externalId: "a",
          duplicateOfIndex: 0,
        }),
        buildItem({
          index: 3,
          outcome: ImportItemOutcomeEnum.DUPLICATE_EXISTING,
          externalId: "c",
          recordId: "rec-9",
          hasContentChanged: true,
        }),
      ]);

      const response = await service.buildSubmitResponse(importId);

      const importPath = `/${API_PREFIX}/imports/${importId}`;
      expect(response).toEqual({
        id: importId,
        status: ImportStatusEnum.PROCESSING,
        summary: { total: 4, accepted: 1, invalid: 1, duplicateInBatch: 1, duplicateExisting: 1 },
        invalidItems: [{ index: 1, externalId: "b", errors }],
        duplicateItems: [
          { index: 2, kind: ImportItemOutcomeEnum.DUPLICATE_IN_BATCH, externalId: "a", duplicateOfIndex: 0 },
          {
            index: 3,
            kind: ImportItemOutcomeEnum.DUPLICATE_EXISTING,
            externalId: "c",
            existingRecordId: "rec-9",
            hasContentChanged: true,
          },
        ],
        warnings: [{ index: 0, ...warning }],
        links: { self: importPath, items: `${importPath}/items` },
      });
    });

    it("uses an empty error list for an invalid item stored without errors", async () => {
      repository.findById.mockResolvedValue(importRow);
      repository.countByImport.mockResolvedValue(buildCounts({ [ImportItemOutcomeEnum.INVALID]: 1 }, {}));
      repository.listItems.mockResolvedValue([buildItem({ outcome: ImportItemOutcomeEnum.INVALID, errors: null })]);

      const response = await service.buildSubmitResponse(importId);

      expect(response.invalidItems[0].errors).toEqual([]);
      expect(response.status).toBe(ImportStatusEnum.COMPLETED_WITH_ISSUES);
    });

    it("throws NOT_FOUND when the import is missing", async () => {
      repository.findById.mockResolvedValue(null);
      repository.listItems.mockResolvedValue([]);
      repository.countByImport.mockResolvedValue(buildCounts({}, {}));

      await expect(service.buildSubmitResponse(importId)).rejects.toMatchObject({ code: ErrorCodeEnum.NOT_FOUND });
    });
  });

  describe("buildDetailResponse", () => {
    it("reports a finished import with its counts, progress and ISO times", async () => {
      repository.findById.mockResolvedValue(importRow);
      repository.countByImport.mockResolvedValue(
        buildCounts(
          { [ImportItemOutcomeEnum.ACCEPTED]: 3, [ImportItemOutcomeEnum.DUPLICATE_EXISTING]: 1 },
          { [RecordStatusEnum.CLASSIFIED]: 2, [RecordStatusEnum.NEEDS_REVIEW]: 1 },
          finishedAt,
        ),
      );

      const response = await service.buildDetailResponse(importId);

      expect(response).toEqual({
        id: importId,
        status: ImportStatusEnum.COMPLETED_WITH_ISSUES,
        createdAt: createdAt.toISOString(),
        completedAt: finishedAt.toISOString(),
        items: { total: 4, accepted: 3, invalid: 0, duplicateInBatch: 0, duplicateExisting: 1 },
        classification: { pending: 0, processing: 0, classified: 2, needsReview: 1, failed: 0 },
        progress: { finished: 3, of: 3, percent: 100 },
      });
    });

    it("has a null completedAt while records are in flight", async () => {
      repository.findById.mockResolvedValue(importRow);
      repository.countByImport.mockResolvedValue(
        buildCounts(
          { [ImportItemOutcomeEnum.ACCEPTED]: 2 },
          { [RecordStatusEnum.PENDING]: 1, [RecordStatusEnum.CLASSIFIED]: 1 },
        ),
      );

      const response = await service.buildDetailResponse(importId);

      expect(response.status).toBe(ImportStatusEnum.PROCESSING);
      expect(response.completedAt).toBeNull();
      expect(response.progress).toEqual({ finished: 1, of: 2, percent: 50 });
    });

    it("throws NOT_FOUND without counting when the import is missing", async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.buildDetailResponse(importId)).rejects.toMatchObject({ code: ErrorCodeEnum.NOT_FOUND });
      expect(repository.countByImport).not.toHaveBeenCalled();
    });
  });
});
