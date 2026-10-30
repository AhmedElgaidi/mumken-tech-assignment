import { HttpStatus } from "@nestjs/common";
import { ErrorCodeEnum } from "../../../infrastructure/contracts/enums/http/error-code.enum";
import { AppSettingsInterface } from "../../../infrastructure/contracts/interfaces/settings/app-settings.interface";
import { ImportItemRowInterface } from "../../../infrastructure/contracts/interfaces/sql-db/import/import-row.interface";
import { ProblemException } from "../../../infrastructure/exceptions/http/problem.exception";
import { ImportRepository } from "../../../infrastructure/repositories/import/import.repository";
import { DEFAULT_APP_SETTINGS } from "../../../infrastructure/constants/settings/app-settings.constant";
import { CursorUtil } from "../../../infrastructure/utils/http/cursor.util";
import { ServiceResultUtil } from "../../../infrastructure/utils/http/service-result.util";
import { ClassificationJobService } from "../../classification/services/classification-job.service";
import { DEFAULT_IMPORT_ITEM_PAGE_SIZE } from "../constants/import-query.constant";
import { ImportItemOutcomeEnum } from "../contracts/enums/import-item-outcome.enum";
import { ListImportItemQueryDto } from "../contracts/dtos/list-import-item-query.dto";
import { SubmitImportResponseInterface } from "../contracts/interfaces/response/submit-import-response.interface";
import { ImportIdempotencyService } from "./import-idempotency.service";
import { ImportReaderService } from "./import-reader.service";
import { ImportService } from "./import.service";
import { ImportStorageService } from "./import-storage.service";

describe("ImportService", () => {
  const importId = "imp-1";
  const settings: AppSettingsInterface = { ...DEFAULT_APP_SETTINGS, import: { maxRecords: 3, maxBodyBytes: "1mb" } };
  const validRecord = (externalId: string): Record<string, unknown> => ({
    externalId,
    title: "Title",
    description: "Description",
    source: "Shop",
    date: "2026-10-25",
  });
  const response = { id: importId } as unknown as SubmitImportResponseInterface;

  let repository: { listItems: jest.Mock };
  let idempotency: { parseKey: jest.Mock; findReplay: jest.Mock; findConcurrentReplay: jest.Mock };
  let storage: { store: jest.Mock };
  let reader: { buildSubmitResponse: jest.Mock; buildDetailResponse: jest.Mock; findImportOrThrow: jest.Mock };
  let jobs: { enqueue: jest.Mock };
  let service: ImportService;

  beforeEach(() => {
    repository = { listItems: jest.fn() };
    idempotency = {
      parseKey: jest.fn().mockReturnValue("key-1"),
      findReplay: jest.fn().mockResolvedValue(null),
      findConcurrentReplay: jest.fn().mockResolvedValue(null),
    };
    storage = {
      store: jest.fn().mockResolvedValue({ importId, created: [{ recordId: "rec-1" }, { recordId: "rec-2" }] }),
    };
    reader = {
      buildSubmitResponse: jest.fn().mockResolvedValue(response),
      buildDetailResponse: jest.fn(),
      findImportOrThrow: jest.fn().mockResolvedValue({ id: importId }),
    };
    jobs = { enqueue: jest.fn().mockResolvedValue(true) };
    service = new ImportService(
      repository as unknown as ImportRepository,
      idempotency as unknown as ImportIdempotencyService,
      storage as unknown as ImportStorageService,
      reader as unknown as ImportReaderService,
      jobs as unknown as ClassificationJobService,
      settings,
    );
    jest.spyOn(service["logger"], "log").mockImplementation();
  });

  describe("submit", () => {
    it("rejects a batch above the limit with 422 TOO_MANY_RECORDS before doing any work", async () => {
      const records = [1, 2, 3, 4].map((n) => validRecord(`e${n}`));

      const failure: unknown = await service.submit(records, undefined).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ProblemException);
      expect((failure as ProblemException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect((failure as ProblemException).code).toBe(ErrorCodeEnum.TOO_MANY_RECORDS);
      expect((failure as ProblemException).extras).toEqual({ maxRecords: 3 });
      expect(idempotency.parseKey).not.toHaveBeenCalled();
      expect(storage.store).not.toHaveBeenCalled();
    });

    it("accepts a batch exactly at the limit", async () => {
      const records = [1, 2, 3].map((n) => validRecord(`e${n}`));
      await expect(service.submit(records, undefined)).resolves.toEqual(ServiceResultUtil.of(response));
    });

    it("propagates an invalid idempotency key without storing", async () => {
      const failure = new Error("bad key");
      idempotency.parseKey.mockImplementation(() => {
        throw failure;
      });

      await expect(service.submit([validRecord("a")], "")).rejects.toBe(failure);
      expect(storage.store).not.toHaveBeenCalled();
    });

    it("returns the replay of a known key without storing or enqueuing", async () => {
      const replay = ServiceResultUtil.of(response, { isReplayed: true });
      idempotency.findReplay.mockResolvedValue(replay);

      const result = await service.submit([validRecord("a")], "key-1");

      expect(result).toBe(replay);
      expect(result).toMatchObject({ isReplayed: true });
      expect(storage.store).not.toHaveBeenCalled();
      expect(jobs.enqueue).not.toHaveBeenCalled();
    });

    it("propagates a key reused with a different body", async () => {
      const failure = new ProblemException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCodeEnum.IDEMPOTENCY_KEY_REUSED,
        "reused",
      );
      idempotency.findReplay.mockRejectedValue(failure);

      await expect(service.submit([validRecord("a")], "key-1")).rejects.toBe(failure);
      expect(storage.store).not.toHaveBeenCalled();
    });

    it("stores the plan, enqueues the created records at generation 0 after the commit, and returns the response", async () => {
      const order: string[] = [];
      storage.store.mockImplementation(async () => {
        order.push("store");
        return { importId, created: [{ recordId: "rec-1" }, { recordId: "rec-2" }] };
      });
      jobs.enqueue.mockImplementation(async () => {
        order.push("enqueue");
        return true;
      });

      const result = await service.submit([validRecord("a"), validRecord("b")], "key-1", "req-1");

      expect(order).toEqual(["store", "enqueue"]);
      const [plan, key, hash] = storage.store.mock.calls[0] as [
        { candidates: unknown[]; items: unknown[] },
        string,
        string,
      ];
      expect(plan.items).toHaveLength(2);
      expect(plan.candidates).toHaveLength(2);
      expect(key).toBe("key-1");
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(idempotency.findReplay).toHaveBeenCalledWith("key-1", hash);
      expect(jobs.enqueue).toHaveBeenCalledWith(
        [
          { recordId: "rec-1", generation: 0 },
          { recordId: "rec-2", generation: 0 },
        ],
        "req-1",
      );
      expect(reader.buildSubmitResponse).toHaveBeenCalledWith(importId);
      expect(result).toEqual(ServiceResultUtil.of(response));
      expect(result).not.toHaveProperty("isReplayed");
    });

    it("still succeeds when the enqueue reports a failure (records stay PENDING for the sweeper)", async () => {
      jobs.enqueue.mockResolvedValue(false);

      await expect(service.submit([validRecord("a")], undefined)).resolves.toEqual(ServiceResultUtil.of(response));
    });

    it("stores invalid items too, so one bad item does not fail the batch", async () => {
      await service.submit([validRecord("a"), { nonsense: true }], undefined);

      const [plan] = storage.store.mock.calls[0] as [
        { items: Array<{ outcome: ImportItemOutcomeEnum | null }>; candidates: unknown[] },
      ];
      expect(plan.items.map((item) => item.outcome)).toEqual([null, ImportItemOutcomeEnum.INVALID]);
      expect(plan.candidates).toHaveLength(1);
    });

    it("replays the concurrent winner when the store hits an idempotency key conflict", async () => {
      const conflict = new Error("unique");
      const replay = ServiceResultUtil.of(response, { isReplayed: true });
      storage.store.mockRejectedValue(conflict);
      idempotency.findConcurrentReplay.mockResolvedValue(replay);

      const result = await service.submit([validRecord("a")], "key-1");

      expect(result).toBe(replay);
      expect(idempotency.findConcurrentReplay).toHaveBeenCalledWith(conflict, "key-1", expect.any(String));
      expect(jobs.enqueue).not.toHaveBeenCalled();
    });

    it("rethrows a store error that is not a key conflict", async () => {
      const failure = new Error("db down");
      storage.store.mockRejectedValue(failure);

      await expect(service.submit([validRecord("a")], "key-1")).rejects.toBe(failure);
      expect(jobs.enqueue).not.toHaveBeenCalled();
    });
  });

  describe("get", () => {
    it("returns the reader's detail response", async () => {
      const detail = { id: importId };
      reader.buildDetailResponse.mockResolvedValue(detail);

      await expect(service.get(importId)).resolves.toBe(detail);
      expect(reader.buildDetailResponse).toHaveBeenCalledWith(importId);
    });
  });

  describe("listItems", () => {
    const buildRows = (count: number): ImportItemRowInterface[] =>
      Array.from({ length: count }, (_value, index) => ({
        index,
        outcome: ImportItemOutcomeEnum.ACCEPTED,
        externalId: `e${index}`,
        source: null,
        errors: null,
        warnings: null,
        recordId: null,
        duplicateOfIndex: null,
        hasContentChanged: null,
      }));

    it("fails with NOT_FOUND before listing when the import is missing", async () => {
      const failure = new ProblemException(HttpStatus.NOT_FOUND, ErrorCodeEnum.NOT_FOUND, "missing");
      reader.findImportOrThrow.mockRejectedValue(failure);

      await expect(service.listItems(importId, {} as ListImportItemQueryDto)).rejects.toBe(failure);
      expect(repository.listItems).not.toHaveBeenCalled();
    });

    it("uses the default page size, asks for one extra row and ends with a null cursor on the last page", async () => {
      repository.listItems.mockResolvedValue(buildRows(2));

      const page = await service.listItems(importId, {} as ListImportItemQueryDto);

      expect(repository.listItems).toHaveBeenCalledWith(importId, {
        outcomes: undefined,
        afterIndex: undefined,
        limit: DEFAULT_IMPORT_ITEM_PAGE_SIZE + 1,
      });
      expect(page.data).toHaveLength(2);
      expect(page.nextCursor).toBeNull();
    });

    it("trims the extra row and returns a cursor for the last returned item when more remain", async () => {
      repository.listItems.mockResolvedValue(buildRows(3));

      const page = await service.listItems(importId, { limit: 2 } as ListImportItemQueryDto);

      expect(page.data.map((row) => row.index)).toEqual([0, 1]);
      expect(CursorUtil.decode(page.nextCursor as string)).toEqual({ index: 1 });
    });

    it("parses the outcome filter and decodes the cursor into the repository query", async () => {
      repository.listItems.mockResolvedValue([]);

      const page = await service.listItems(importId, {
        outcome: "invalid, accepted",
        cursor: CursorUtil.encode({ index: 4 }),
        limit: 10,
      } as ListImportItemQueryDto);

      expect(repository.listItems).toHaveBeenCalledWith(importId, {
        outcomes: [ImportItemOutcomeEnum.INVALID, ImportItemOutcomeEnum.ACCEPTED],
        afterIndex: 4,
        limit: 11,
      });
      expect(page).toEqual({ data: [], nextCursor: null });
    });

    it("rejects an unknown outcome with INVALID_FILTER and a malformed cursor with INVALID_CURSOR", async () => {
      await expect(service.listItems(importId, { outcome: "NOPE" } as ListImportItemQueryDto)).rejects.toMatchObject({
        code: ErrorCodeEnum.INVALID_FILTER,
      });
      await expect(
        service.listItems(importId, { cursor: "not-a-cursor" } as ListImportItemQueryDto),
      ).rejects.toMatchObject({ code: ErrorCodeEnum.INVALID_CURSOR });
      expect(repository.listItems).not.toHaveBeenCalled();
    });
  });
});
