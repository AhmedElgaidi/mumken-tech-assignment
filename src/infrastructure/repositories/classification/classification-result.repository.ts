import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/sequelize";
import { Transaction } from "sequelize";
import { Sequelize } from "sequelize-typescript";
import { AttemptOutcomeEnum } from "../../../modules/classification/contracts/enums/lifecycle/attempt-outcome.enum";
import { ClassificationKindEnum } from "../../../modules/classification/contracts/enums/lifecycle/classification-kind.enum";
import { FailureKindEnum } from "../../../modules/classification/contracts/enums/lifecycle/failure-kind.enum";
import { RecordStatusEnum } from "../../../modules/classification/contracts/enums/lifecycle/record-status.enum";
import { RecordTriggerEnum } from "../../../modules/classification/contracts/enums/lifecycle/record-trigger.enum";
import { RecordStatusMachineUtil } from "../../../modules/classification/utils/record-status-machine.util";
import { TransactionHelper } from "../../helpers/sql-db/transaction.helper";
import { SqlBaseRepository } from "../persistence/sql-base.repository";
import { ATTEMPT_ERROR } from "../../constants/sql-db/attempt-error.constant";
import { LeaseWriteResultEnum } from "../../contracts/enums/sql-db/lease-write-result.enum";
import {
  AutomaticResultInterface,
  ClaimedRecordInterface,
} from "../../contracts/interfaces/sql-db/classification/claimed-record.interface";
import { ClassificationVanishedException } from "../../exceptions/sql-db/classification-vanished.exception";
import { LostLeaseException } from "../../exceptions/sql-db/lost-lease.exception";

/**
 * The lease-guarded writes that finish an attempt: the stored classification, the record
 * status and the attempt row, together in one transaction. Every record update is guarded by
 * the lease token, so a worker that lost its lease changes nothing.
 */
@Injectable()
export class ClassificationResultRepository extends SqlBaseRepository {
  public constructor(@InjectConnection() sequelize: Sequelize) {
    super(sequelize);
  }

  /**
   * Saves the automatic result in one transaction: classification row (at most one AUTOMATIC
   * per record, by a partial unique index), record status, and the attempt row.
   *
   * Steps:
   * 1. Insert the classification, or read the one a racing worker already stored.
   * 2. Move the record to its result status, guarded by the lease token.
   * 3. Insert the attempt row.
   *
   * @param record - The record as claimed.
   * @param result - The classifier verdict.
   * @param durationMs - How long the classifier call took.
   * @param transaction - The enclosing transaction; the write then runs in a savepoint.
   * @returns `saved`, or `lost-lease` when another worker owns the record now.
   */
  public async saveSuccess(
    record: ClaimedRecordInterface,
    result: AutomaticResultInterface,
    durationMs: number,
    transaction?: Transaction,
  ): Promise<LeaseWriteResultEnum> {
    return this.runLeaseGuarded(async (guardedTransaction) => {
      // 1. Insert the classification, or read the one a racing worker already stored.
      const classificationId = await this.insertOrFindAutomaticClassification(record, result, guardedTransaction);

      // 2. Move the record to its result status, guarded by the lease token.
      await this.moveRecordToResultStatus(record, result, classificationId, guardedTransaction);

      // 3. Insert the attempt row.
      await this.insertAttempt(record, AttemptOutcomeEnum.SUCCEEDED, null, durationMs, guardedTransaction);
    }, transaction);
  }

  /**
   * Records a failed attempt and moves the record back to PENDING (retryable) or to FAILED.
   *
   * Steps:
   * 1. Update the record, guarded by the lease token.
   * 2. Insert the attempt row.
   *
   * @param record - The record as claimed.
   * @param outcome - How the attempt ended.
   * @param error - The error message (cut to the stored length limit).
   * @param durationMs - How long the attempt took.
   * @param nextState - The status the record moves to, with the failure kind when FAILED.
   * @param transaction - The enclosing transaction; the write then runs in a savepoint.
   * @returns `saved`, or `lost-lease` when another worker owns the record now.
   */
  public async saveFailure(
    record: ClaimedRecordInterface,
    outcome: AttemptOutcomeEnum,
    error: string,
    durationMs: number,
    nextState: { status: RecordStatusEnum.PENDING } | { status: RecordStatusEnum.FAILED; failureKind: FailureKindEnum },
    transaction?: Transaction,
  ): Promise<LeaseWriteResultEnum> {
    return this.runLeaseGuarded(async (guardedTransaction) => {
      // 1. Update the record, guarded by the lease token.
      await this.moveRecordAfterFailure(record, error, nextState, guardedTransaction);

      // 2. Insert the attempt row.
      await this.insertAttempt(record, outcome, error, durationMs, guardedTransaction);
    }, transaction);
  }

  /**
   * Inserts the AUTOMATIC classification of a record, or finds the one a racing worker stored.
   *
   * Steps:
   * 1. Insert the classification and return its id.
   * 2. Otherwise read the one a racing worker stored.
   * 3. Throw when it is not there either.
   * 4. Return the id of the stored classification.
   *
   * @param record - The record as claimed.
   * @param result - The classifier verdict.
   * @param transaction - The transaction the write belongs to.
   * @returns Public id of the stored classification.
   * @throws ClassificationVanishedException when it can be neither inserted nor found.
   */
  private async insertOrFindAutomaticClassification(
    record: ClaimedRecordInterface,
    result: AutomaticResultInterface,
    transaction: Transaction,
  ): Promise<string> {
    // 1. Insert the classification and return its id.
    const inserted = await this.selectOne<{ id: string }>(
      `INSERT INTO "Classification" ("recordId", kind, "categoryCode", confidence, "isReviewNeeded", classifier, "rawOutput")
       VALUES ((SELECT id FROM "Record" WHERE "publicId" = $1::uuid), $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT DO NOTHING
       RETURNING "publicId" AS id`,
      [
        record.id,
        ClassificationKindEnum.AUTOMATIC,
        result.categoryCode,
        result.confidence,
        result.isReviewNeeded,
        result.classifier,
        JSON.stringify(result.rawOutput ?? null),
      ],
      transaction,
    );
    if (inserted) {
      return inserted.id;
    }

    // 2. Otherwise read the one a racing worker stored.
    const existing = await this.selectOne<{ id: string }>(
      `SELECT c."publicId" AS id
         FROM "Classification" c JOIN "Record" r ON r.id = c."recordId"
        WHERE r."publicId" = $1::uuid AND c.kind = $2`,
      [record.id, ClassificationKindEnum.AUTOMATIC],
      transaction,
    );

    // 3. Throw when it is not there either.
    if (!existing) {
      throw new ClassificationVanishedException(record.id);
    }

    // 4. Return the id of the stored classification.
    return existing.id;
  }

  /**
   * Moves the record to CLASSIFIED or NEEDS_REVIEW and points it at its classification.
   *
   * Steps:
   * 1. Pick the result status from the review flag.
   * 2. Update the record, guarded by the lease token.
   * 3. Throw when no row matched the lease token.
   *
   * @param record - The record as claimed.
   * @param result - The classifier verdict.
   * @param classificationId - Public id of the stored classification.
   * @param transaction - The transaction the write belongs to.
   * @throws LostLeaseException when the lease token no longer matches.
   */
  private async moveRecordToResultStatus(
    record: ClaimedRecordInterface,
    result: AutomaticResultInterface,
    classificationId: string,
    transaction: Transaction,
  ): Promise<void> {
    // 1. Pick the result status from the review flag.
    const status = result.isReviewNeeded ? RecordStatusEnum.NEEDS_REVIEW : RecordStatusEnum.CLASSIFIED;

    // 2. Update the record, guarded by the lease token.
    const updatedRows = await this.selectRows<{ id: string }>(
      `UPDATE "Record"
          SET "classificationStatus" = $3,
              "currentClassificationId" = (SELECT id FROM "Classification" WHERE "publicId" = $4::uuid),
              "currentCategoryCode" = (SELECT "categoryCode" FROM "Classification" WHERE "publicId" = $4::uuid),
              "leaseToken" = NULL, "leaseExpiresAt" = NULL, "lastError" = NULL, "finishedAt" = now()
        WHERE "publicId" = $1::uuid AND "leaseToken" = $2 AND "classificationStatus" = ANY($5::text[])
        RETURNING "publicId" AS id`,
      [
        record.id,
        record.leaseToken,
        status,
        classificationId,
        RecordStatusMachineUtil.getFromStatuses(RecordTriggerEnum.SUCCEED),
      ],
      transaction,
    );

    // 3. Throw when no row matched the lease token.
    if (updatedRows.length === 0) {
      throw new LostLeaseException();
    }
  }

  /**
   * Moves the record back to PENDING or to FAILED and stores the error.
   *
   * Steps:
   * 1. Note whether the new status is final.
   * 2. Update the record, guarded by the lease token.
   * 3. Throw when no row matched the lease token.
   *
   * @param record - The record as claimed.
   * @param error - The error message (cut to the stored length limit).
   * @param nextState - The status the record moves to, with the failure kind when FAILED.
   * @param transaction - The transaction the write belongs to.
   * @throws LostLeaseException when the lease token no longer matches.
   */
  private async moveRecordAfterFailure(
    record: ClaimedRecordInterface,
    error: string,
    nextState: { status: RecordStatusEnum.PENDING } | { status: RecordStatusEnum.FAILED; failureKind: FailureKindEnum },
    transaction: Transaction,
  ): Promise<void> {
    // 1. Note whether the new status is final.
    const isFinal = nextState.status === RecordStatusEnum.FAILED;

    // 2. Update the record, guarded by the lease token.
    const updatedRows = await this.selectRows<{ id: string }>(
      `UPDATE "Record"
          SET "classificationStatus" = $3, "failureKind" = $4, "lastError" = $5,
              "leaseToken" = NULL, "leaseExpiresAt" = NULL,
              "finishedAt" = CASE WHEN $7::boolean THEN now() ELSE NULL END
        WHERE "publicId" = $1::uuid AND "leaseToken" = $2 AND "classificationStatus" = ANY($6::text[])
        RETURNING "publicId" AS id`,
      [
        record.id,
        record.leaseToken,
        nextState.status,
        isFinal ? nextState.failureKind : null,
        error.slice(0, ATTEMPT_ERROR.MAX_STORED_LENGTH),
        RecordStatusMachineUtil.getFromStatuses(RecordTriggerEnum.FAIL_RETRYABLE),
        isFinal,
      ],
      transaction,
    );

    // 3. Throw when no row matched the lease token.
    if (updatedRows.length === 0) {
      throw new LostLeaseException();
    }
  }

  /**
   * Inserts the attempt row; a repeated attempt number is ignored.
   *
   * @param record - The record as claimed.
   * @param outcome - How the attempt ended.
   * @param error - The error message, or `null` on success.
   * @param durationMs - How long the attempt took.
   * @param transaction - The transaction the write belongs to.
   */
  private async insertAttempt(
    record: ClaimedRecordInterface,
    outcome: AttemptOutcomeEnum,
    error: string | null,
    durationMs: number,
    transaction: Transaction,
  ): Promise<void> {
    await this.execute(
      `INSERT INTO "ClassificationAttempt" ("recordId", "retryGeneration", "attemptNo", outcome, error, "durationMs")
       VALUES ((SELECT id FROM "Record" WHERE "publicId" = $1::uuid), $2, $3, $4, $5, $6)
       ON CONFLICT ("recordId", "retryGeneration", "attemptNo") DO NOTHING`,
      [
        record.id,
        record.retryGeneration,
        record.attemptCount,
        outcome,
        error?.slice(0, ATTEMPT_ERROR.MAX_STORED_LENGTH) ?? null,
        Math.round(durationMs),
      ],
      transaction,
    );
  }

  /**
   * Runs the writes in one transaction and turns a lost lease into a result, not an error.
   *
   * Steps:
   * 1. Open the transaction and run the writes.
   * 2. Commit and report `saved`.
   * 3. Roll back, and report `lost-lease` or rethrow any other error.
   *
   * @param work - The writes to run.
   * @param parent - The enclosing transaction; the writes then run in a savepoint.
   * @returns `saved`, or `lost-lease` when `work` threw `LostLeaseException`.
   */
  private async runLeaseGuarded(
    work: (transaction: Transaction) => Promise<void>,
    parent?: Transaction,
  ): Promise<LeaseWriteResultEnum> {
    const transaction = await this.createTransaction(parent);
    try {
      // 1. Open the transaction and run the writes.
      await work(transaction);

      // 2. Commit and report `saved`.
      await transaction.commit();
      return LeaseWriteResultEnum.SAVED;
    } catch (error) {
      // 3. Roll back, and report `lost-lease` or rethrow any other error.
      await TransactionHelper.rollbackQuietly(transaction);
      if (error instanceof LostLeaseException) {
        return LeaseWriteResultEnum.LOST_LEASE;
      }
      throw error;
    }
  }
}
