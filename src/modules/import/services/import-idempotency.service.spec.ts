import { HttpStatus } from "@nestjs/common";
import { POSTGRES_ERROR_CODE } from "../../../infrastructure/constants/sql-db/postgres-error-code.constant";
import { IMPORT_IDEMPOTENCY_KEY_CONSTRAINT } from "../../../infrastructure/constants/sql-db/sql-db.constant";
import { ErrorCodeEnum } from "../../../infrastructure/contracts/enums/http/error-code.enum";
import { ImportRowInterface } from "../../../infrastructure/contracts/interfaces/sql-db/import/import-row.interface";
import { ProblemException } from "../../../infrastructure/exceptions/http/problem.exception";
import { ImportRepository } from "../../../infrastructure/repositories/import/import.repository";
import { ServiceResultUtil } from "../../../infrastructure/utils/http/service-result.util";
import { IDEMPOTENCY_KEY_MAX_LENGTH } from "../constants/import.constant";
import { SubmitImportResponseInterface } from "../contracts/interfaces/response/submit-import-response.interface";
import { ImportIdempotencyService } from "./import-idempotency.service";
import { ImportReaderService } from "./import-reader.service";

describe("ImportIdempotencyService", () => {
  const requestHash = "hash-a";
  const existingImport: ImportRowInterface = {
    id: "imp-1",
    idempotencyKey: "key-1",
    requestHash,
    totalItems: 2,
    createdAt: new Date("2026-10-25T10:00:00Z"),
  };
  const response = { id: "imp-1" } as unknown as SubmitImportResponseInterface;
  const keyConflict = {
    parent: { code: POSTGRES_ERROR_CODE.UNIQUE_VIOLATION, constraint: IMPORT_IDEMPOTENCY_KEY_CONSTRAINT },
  };

  let repository: { findByIdempotencyKey: jest.Mock };
  let reader: { buildSubmitResponse: jest.Mock };
  let service: ImportIdempotencyService;

  beforeEach(() => {
    repository = { findByIdempotencyKey: jest.fn() };
    reader = { buildSubmitResponse: jest.fn().mockResolvedValue(response) };
    service = new ImportIdempotencyService(
      repository as unknown as ImportRepository,
      reader as unknown as ImportReaderService,
    );
  });

  describe("parseKey", () => {
    it("returns null when no header was sent", () => {
      expect(service.parseKey(undefined)).toBeNull();
    });

    it("returns a valid key unchanged, including one at the maximum length", () => {
      const longest = "k".repeat(IDEMPOTENCY_KEY_MAX_LENGTH);
      expect(service.parseKey("key-1")).toBe("key-1");
      expect(service.parseKey(longest)).toBe(longest);
    });

    it.each([
      ["empty", ""],
      ["too long", "k".repeat(IDEMPOTENCY_KEY_MAX_LENGTH + 1)],
    ])("rejects a key that is %s with 400 INVALID_IDEMPOTENCY_KEY", (_label, value) => {
      let failure: unknown;
      try {
        service.parseKey(value);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(ProblemException);
      expect((failure as ProblemException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect((failure as ProblemException).code).toBe(ErrorCodeEnum.INVALID_IDEMPOTENCY_KEY);
    });
  });

  describe("findReplay", () => {
    it("returns null without a lookup when there is no key", async () => {
      await expect(service.findReplay(null, requestHash)).resolves.toBeNull();
      expect(repository.findByIdempotencyKey).not.toHaveBeenCalled();
    });

    it("returns null when the key was never used", async () => {
      repository.findByIdempotencyKey.mockResolvedValue(null);
      await expect(service.findReplay("key-1", requestHash)).resolves.toBeNull();
    });

    it("replays the first response, flagged isReplayed, when the body is the same", async () => {
      repository.findByIdempotencyKey.mockResolvedValue(existingImport);

      const result = await service.findReplay("key-1", requestHash);

      expect(result).toEqual(ServiceResultUtil.of(response, { isReplayed: true }));
      expect(reader.buildSubmitResponse).toHaveBeenCalledWith("imp-1");
    });

    it("rejects the same key with a different body as 422 IDEMPOTENCY_KEY_REUSED", async () => {
      repository.findByIdempotencyKey.mockResolvedValue(existingImport);

      const failure: unknown = await service.findReplay("key-1", "hash-b").catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ProblemException);
      expect((failure as ProblemException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect((failure as ProblemException).code).toBe(ErrorCodeEnum.IDEMPOTENCY_KEY_REUSED);
      expect((failure as ProblemException).extras).toEqual({ importId: "imp-1" });
      expect(reader.buildSubmitResponse).not.toHaveBeenCalled();
    });
  });

  describe("findConcurrentReplay", () => {
    it("returns null without a lookup when there is no key", async () => {
      await expect(service.findConcurrentReplay(keyConflict, null, requestHash)).resolves.toBeNull();
      expect(repository.findByIdempotencyKey).not.toHaveBeenCalled();
    });

    it.each([
      ["a plain error", new Error("boom")],
      [
        "a unique violation of another constraint",
        { parent: { code: POSTGRES_ERROR_CODE.UNIQUE_VIOLATION, constraint: "other" } },
      ],
      [
        "the right constraint with another code",
        { parent: { code: POSTGRES_ERROR_CODE.DEADLOCK_DETECTED, constraint: IMPORT_IDEMPOTENCY_KEY_CONSTRAINT } },
      ],
      ["a non-object", "oops"],
    ])("returns null for %s", async (_label, error) => {
      await expect(service.findConcurrentReplay(error, "key-1", requestHash)).resolves.toBeNull();
      expect(repository.findByIdempotencyKey).not.toHaveBeenCalled();
    });

    it("returns null when the winner cannot be found", async () => {
      repository.findByIdempotencyKey.mockResolvedValue(null);
      await expect(service.findConcurrentReplay(keyConflict, "key-1", requestHash)).resolves.toBeNull();
    });

    it("replays the winner's result as isReplayed after a key conflict", async () => {
      repository.findByIdempotencyKey.mockResolvedValue(existingImport);

      const result = await service.findConcurrentReplay(keyConflict, "key-1", requestHash);

      expect(result).toEqual(ServiceResultUtil.of(response, { isReplayed: true }));
    });

    it("rejects a concurrent winner that used a different body", async () => {
      repository.findByIdempotencyKey.mockResolvedValue(existingImport);

      await expect(service.findConcurrentReplay(keyConflict, "key-1", "hash-b")).rejects.toMatchObject({
        code: ErrorCodeEnum.IDEMPOTENCY_KEY_REUSED,
      });
    });
  });
});
