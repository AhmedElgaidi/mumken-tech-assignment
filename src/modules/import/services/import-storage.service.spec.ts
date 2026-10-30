import { POSTGRES_ERROR_CODE } from "../../../infrastructure/constants/sql-db/postgres-error-code.constant";
import { ImportRepository } from "../../../infrastructure/repositories/import/import.repository";
import { ImportItemOutcomeEnum } from "../contracts/enums/import-item-outcome.enum";
import { ImportPlanInterface } from "../contracts/interfaces/plan/import-plan.interface";
import { ValidRecordInterface } from "../contracts/interfaces/item/valid-record.interface";
import { ImportStorageService } from "./import-storage.service";

describe("ImportStorageService", () => {
  const importId = "imp-1";
  const record: ValidRecordInterface = {
    externalId: "ext-1",
    title: "Title",
    description: "Description",
    source: "Shop",
    sourceKey: "shop",
    recordDate: new Date("2026-10-25T00:00:00Z"),
    contentHash: "hash-1",
  };
  const plan: ImportPlanInterface = {
    items: [
      {
        index: 0,
        validation: { isValid: true, record, warnings: [] },
        outcome: null,
        duplicateOfIndex: null,
      },
    ],
    candidates: [{ index: 0, record }],
  };

  let transaction: { commit: jest.Mock; rollback: jest.Mock };
  let repository: {
    createTransaction: jest.Mock;
    createImport: jest.Mock;
    insertRecords: jest.Mock;
    findRecordsByKeys: jest.Mock;
    insertItems: jest.Mock;
  };
  let service: ImportStorageService;

  beforeEach(() => {
    transaction = { commit: jest.fn().mockResolvedValue(undefined), rollback: jest.fn().mockResolvedValue(undefined) };
    repository = {
      createTransaction: jest.fn().mockImplementation(async () => transaction),
      createImport: jest.fn().mockResolvedValue(importId),
      insertRecords: jest
        .fn()
        .mockResolvedValue([
          { id: "rec-1", sourceKey: record.sourceKey, externalId: record.externalId, contentHash: record.contentHash },
        ]),
      findRecordsByKeys: jest.fn().mockResolvedValue([]),
      insertItems: jest.fn().mockResolvedValue(undefined),
    };
    service = new ImportStorageService(repository as unknown as ImportRepository);
    jest.spyOn(service["logger"], "warn").mockImplementation();
  });

  it("stores the import, records and items, commits, and returns the created records", async () => {
    const result = await service.store(plan, "key-1", "hash");

    expect(result).toEqual({ importId, created: [{ recordId: "rec-1" }] });
    expect(repository.createImport).toHaveBeenCalledWith(transaction, {
      idempotencyKey: "key-1",
      requestHash: "hash",
      totalItems: 1,
    });
    expect(repository.insertRecords).toHaveBeenCalledWith(transaction, importId, [record]);
    const [, , rows] = repository.insertItems.mock.calls[0] as [
      unknown,
      string,
      Array<{ outcome: string; recordId: string }>,
    ];
    expect(rows).toEqual([expect.objectContaining({ outcome: ImportItemOutcomeEnum.ACCEPTED, recordId: "rec-1" })]);
    expect(transaction.commit).toHaveBeenCalledTimes(1);
    expect(transaction.rollback).not.toHaveBeenCalled();
  });

  it("marks a record an earlier import stored as DUPLICATE_EXISTING", async () => {
    repository.insertRecords.mockResolvedValue([]);
    repository.findRecordsByKeys.mockResolvedValue([
      { id: "old-1", sourceKey: record.sourceKey, externalId: record.externalId, contentHash: "other-hash" },
    ]);

    const result = await service.store(plan, null, "hash");

    expect(result.created).toEqual([]);
    const [, , rows] = repository.insertItems.mock.calls[0] as [unknown, string, Array<Record<string, unknown>>];
    expect(rows[0]).toEqual(
      expect.objectContaining({
        outcome: ImportItemOutcomeEnum.DUPLICATE_EXISTING,
        recordId: "old-1",
        hasContentChanged: true,
      }),
    );
  });

  it("rolls back and rethrows the original error when a step fails", async () => {
    const failure = new Error("insert failed");
    repository.insertItems.mockRejectedValue(failure);

    await expect(service.store(plan, null, "hash")).rejects.toBe(failure);
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
    expect(transaction.commit).not.toHaveBeenCalled();
  });

  it("rethrows the original error even when the rollback itself fails", async () => {
    const failure = new Error("insert failed");
    repository.insertItems.mockRejectedValue(failure);
    transaction.rollback.mockRejectedValue(new Error("rollback failed"));

    await expect(service.store(plan, null, "hash")).rejects.toBe(failure);
  });

  it("retries once with a fresh transaction after a deadlock", async () => {
    const deadlock = Object.assign(new Error("deadlock"), { parent: { code: POSTGRES_ERROR_CODE.DEADLOCK_DETECTED } });
    const firstTransaction = { commit: jest.fn(), rollback: jest.fn().mockResolvedValue(undefined) };
    repository.createTransaction.mockResolvedValueOnce(firstTransaction);
    repository.createImport.mockRejectedValueOnce(deadlock);

    const result = await service.store(plan, null, "hash");

    expect(result.importId).toBe(importId);
    expect(repository.createTransaction).toHaveBeenCalledTimes(2);
    expect(firstTransaction.rollback).toHaveBeenCalledTimes(1);
    expect(firstTransaction.commit).not.toHaveBeenCalled();
    expect(transaction.commit).toHaveBeenCalledTimes(1);
  });

  it("rethrows a second deadlock without a third attempt", async () => {
    const deadlock = Object.assign(new Error("deadlock"), { code: POSTGRES_ERROR_CODE.DEADLOCK_DETECTED });
    repository.createImport.mockRejectedValue(deadlock);

    await expect(service.store(plan, null, "hash")).rejects.toBe(deadlock);
    expect(repository.createTransaction).toHaveBeenCalledTimes(2);
  });

  it("does not retry an error that is not a deadlock", async () => {
    const failure = new Error("other");
    repository.createImport.mockRejectedValue(failure);

    await expect(service.store(plan, null, "hash")).rejects.toBe(failure);
    expect(repository.createTransaction).toHaveBeenCalledTimes(1);
  });
});
