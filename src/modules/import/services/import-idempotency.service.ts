import { HttpStatus, Injectable } from "@nestjs/common";
import { ErrorCodeEnum } from "../../../infrastructure/contracts/enums/http/error-code.enum";
import { ProblemException } from "../../../infrastructure/exceptions/http/problem.exception";
import { ServiceResultInterface } from "../../../infrastructure/contracts/interfaces/http/service-result.interface";
import { ServiceResultUtil } from "../../../infrastructure/utils/http/service-result.util";
import { ImportRowInterface } from "../../../infrastructure/contracts/interfaces/sql-db/import/import-row.interface";
import { ImportRepository } from "../../../infrastructure/repositories/import/import.repository";
import { POSTGRES_ERROR_CODE } from "../../../infrastructure/constants/sql-db/postgres-error-code.constant";
import { IMPORT_IDEMPOTENCY_KEY_CONSTRAINT } from "../../../infrastructure/constants/sql-db/sql-db.constant";
import { PostgresErrorUtil } from "../../../infrastructure/utils/sql-db/postgres-error.util";
import { IDEMPOTENCY_KEY_MAX_LENGTH } from "../constants/import.constant";
import { SubmitImportResponseInterface } from "../contracts/interfaces/response/submit-import-response.interface";
import { ImportReaderService } from "./import-reader.service";

/** Validates the `Idempotency-Key` and replays the first result of a key that was already used. */
@Injectable()
export class ImportIdempotencyService {
  public constructor(
    private readonly importRepository: ImportRepository,
    private readonly importReaderService: ImportReaderService,
  ) {}

  /**
   * Read the optional idempotency key and check its length.
   *
   * Steps:
   * 1. Return no key when none was sent.
   * 2. Reject an empty or too long key.
   * 3. Return the key.
   *
   * @param headerValue - The Idempotency-Key header value.
   * @returns The key, or `null` when none was sent.
   * @throws ProblemException `INVALID_IDEMPOTENCY_KEY` when the key is empty or too long.
   */
  public parseKey(headerValue: string | undefined): string | null {
    // 1. Return no key when none was sent.
    if (headerValue === undefined) {
      return null;
    }

    // 2. Reject an empty or too long key.
    if (headerValue.length === 0 || headerValue.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
      throw new ProblemException(
        HttpStatus.BAD_REQUEST,
        ErrorCodeEnum.INVALID_IDEMPOTENCY_KEY,
        `Idempotency-Key must be 1 to ${IDEMPOTENCY_KEY_MAX_LENGTH} characters`,
      );
    }

    // 3. Return the key.
    return headerValue;
  }

  /**
   * Replays the import that already used this key, when there is one.
   *
   * Steps:
   * 1. Skip a request that has no key.
   * 2. Find the import that used the key.
   * 3. Replay its result.
   *
   * @param key - The idempotency key, or `null` when none was sent.
   * @param requestHash - Hash of the request body.
   * @returns The replayed result, or `null` when the key was never used.
   * @throws ProblemException `IDEMPOTENCY_KEY_REUSED` when the key was used with a different body.
   */
  public async findReplay(
    key: string | null,
    requestHash: string,
  ): Promise<ServiceResultInterface<SubmitImportResponseInterface> | null> {
    // 1. Skip a request that has no key.
    if (key === null) {
      return null;
    }

    // 2. Find the import that used the key.
    const existingImport = await this.importRepository.findByIdempotencyKey(key);
    if (!existingImport) {
      return null;
    }

    // 3. Replay its result.
    return this.replay(existingImport, requestHash);
  }

  /**
   * A concurrent request with the same key committed first: its import is replayed instead of failing.
   *
   * Steps:
   * 1. Skip a request that has no key.
   * 2. Check the error is a key conflict.
   * 3. Find the import that won.
   * 4. Replay the winner's result.
   *
   * @param error - The error thrown while storing the import.
   * @param key - The idempotency key, or `null` when none was sent.
   * @param requestHash - Hash of the request body.
   * @returns The replayed result, or `null` when the error is not a key conflict.
   */
  public async findConcurrentReplay(
    error: unknown,
    key: string | null,
    requestHash: string,
  ): Promise<ServiceResultInterface<SubmitImportResponseInterface> | null> {
    // 1. Skip a request that has no key.
    if (key === null) {
      return null;
    }

    // 2. Check the error is a key conflict.
    const isKeyConflict =
      PostgresErrorUtil.getCode(error) === POSTGRES_ERROR_CODE.UNIQUE_VIOLATION &&
      PostgresErrorUtil.getConstraint(error) === IMPORT_IDEMPOTENCY_KEY_CONSTRAINT;
    if (!isKeyConflict) {
      return null;
    }

    // 3. Find the import that won.
    const winnerImport = await this.importRepository.findByIdempotencyKey(key);
    if (!winnerImport) {
      return null;
    }

    // 4. Replay the winner's result.
    return this.replay(winnerImport, requestHash);
  }

  /**
   * Returns the stored result of an earlier import, after checking the body is the same.
   *
   * Steps:
   * 1. Reject a different request body.
   * 2. Rebuild the first response.
   * 3. Return it flagged as a replay.
   *
   * @param existingImport - The import that used the key first.
   * @param requestHash - Hash of the current request body.
   * @returns The first result, flagged as a replay.
   * @throws ProblemException `IDEMPOTENCY_KEY_REUSED` when the body differs from the first request.
   */
  private async replay(
    existingImport: ImportRowInterface,
    requestHash: string,
  ): Promise<ServiceResultInterface<SubmitImportResponseInterface>> {
    // 1. Reject a different request body.
    if (existingImport.requestHash !== requestHash) {
      throw new ProblemException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCodeEnum.IDEMPOTENCY_KEY_REUSED,
        "This Idempotency-Key was already used with a different request body; use a new key for a new import",
        { importId: existingImport.id },
      );
    }

    // 2. Rebuild the first response.
    const response = await this.importReaderService.buildSubmitResponse(existingImport.id);

    // 3. Return it flagged as a replay.
    return ServiceResultUtil.of(response, { isReplayed: true });
  }
}
