import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/sequelize";
import { Transaction } from "sequelize";
import { Sequelize } from "sequelize-typescript";
import { SqlBaseRepository } from "../persistence/sql-base.repository";
import { FailureKindEnum } from "../../../modules/classification/contracts/enums/lifecycle/failure-kind.enum";
import { RecordStatusEnum } from "../../../modules/classification/contracts/enums/lifecycle/record-status.enum";
import { RecordTriggerEnum } from "../../../modules/classification/contracts/enums/lifecycle/record-trigger.enum";
import { RecordStatusMachineUtil } from "../../../modules/classification/utils/record-status-machine.util";
import {
  ClaimedRecordInterface,
  RecordWorkStateInterface,
  StuckRecordCursorInterface,
  StuckRecordInterface,
} from "../../contracts/interfaces/sql-db/classification/claimed-record.interface";

/**
 * The statements that claim, inspect and find stuck records for the worker and the sweeper.
 * Each status change is a conditional UPDATE guarded by the status (from the state machine).
 * Callers pass and receive public ids; the internal `bigint` ids stay inside the SQL.
 */
@Injectable()
export class RecordLeaseRepository extends SqlBaseRepository {
  public constructor(@InjectConnection() sequelize: Sequelize) {
    super(sequelize);
  }

  /**
   * Claims a PENDING record, or a PROCESSING one whose lease expired, and counts the attempt.
   *
   * @param recordId - Public id of the record.
   * @param leaseToken - Token the claiming worker will prove ownership with.
   * @param leaseMs - How long the lease lasts, in milliseconds.
   * @param maxAttempts - Attempts allowed per retry generation.
   * @param transaction - The enclosing transaction, when there is one.
   * @returns The claimed record, or `null` when it could not be claimed.
   */
  public async claim(
    recordId: string,
    leaseToken: string,
    leaseMs: number,
    maxAttempts: number,
    transaction?: Transaction,
  ): Promise<ClaimedRecordInterface | null> {
    return this.selectOne<ClaimedRecordInterface>(
      `UPDATE "Record"
          SET "classificationStatus" = $7, "leaseToken" = $2,
              "leaseExpiresAt" = now() + ($3::int * interval '1 millisecond'),
              "attemptCount" = "attemptCount" + 1
        WHERE "publicId" = $1::uuid AND "attemptCount" < $4
          AND ("classificationStatus" = ANY($5::text[])
               OR ("classificationStatus" = ANY($6::text[]) AND "leaseExpiresAt" < now()))
        RETURNING "publicId" AS id, title, description, source, "recordDate",
                  "attemptCount", "retryGeneration",
                  "leaseToken"`,
      [
        recordId,
        leaseToken,
        leaseMs,
        maxAttempts,
        RecordStatusMachineUtil.getFromStatuses(RecordTriggerEnum.CLAIM),
        RecordStatusMachineUtil.getFromStatuses(RecordTriggerEnum.RECLAIM_EXPIRED_LEASE),
        RecordStatusEnum.PROCESSING,
      ],
      transaction,
    );
  }

  /**
   * Reads the fields the worker checks before and after an attempt.
   *
   * @param recordId - Public id of the record.
   * @param transaction - The enclosing transaction, when there is one.
   * @returns The work state, or `null` when the record does not exist.
   */
  public async readWorkState(recordId: string, transaction?: Transaction): Promise<RecordWorkStateInterface | null> {
    return this.selectOne<RecordWorkStateInterface>(
      `SELECT "publicId" AS id, "classificationStatus" AS status, "attemptCount",
              ("leaseExpiresAt" IS NOT NULL AND "leaseExpiresAt" >= now()) AS "isLeaseValid"
         FROM "Record" WHERE "publicId" = $1::uuid`,
      [recordId],
      transaction,
    );
  }

  /**
   * Fails a record whose attempts are used up without a live lease (e.g. it crashes the worker).
   *
   * @param recordId - Public id of the record.
   * @param maxAttempts - Attempts allowed per retry generation.
   * @param reason - Error message stored when the record has none yet.
   * @param transaction - The enclosing transaction, when there is one.
   * @returns Whether the record was moved to FAILED.
   */
  public async markExhausted(
    recordId: string,
    maxAttempts: number,
    reason: string,
    transaction?: Transaction,
  ): Promise<boolean> {
    const rows = await this.selectRows<{ id: string }>(
      `UPDATE "Record"
          SET "classificationStatus" = $6, "failureKind" = $3, "leaseToken" = NULL,
              "leaseExpiresAt" = NULL, "finishedAt" = now(), "lastError" = COALESCE("lastError", $4)
        WHERE "publicId" = $1::uuid AND "attemptCount" >= $2
          AND "classificationStatus" = ANY($5::text[])
          AND ("classificationStatus" = $7 OR "leaseExpiresAt" < now())
        RETURNING "publicId" AS id`,
      [
        recordId,
        maxAttempts,
        FailureKindEnum.TRANSIENT_EXHAUSTED,
        reason,
        RecordStatusMachineUtil.getFromStatuses(RecordTriggerEnum.EXHAUST_ON_CLAIM),
        RecordStatusEnum.FAILED,
        RecordStatusEnum.PENDING,
      ],
      transaction,
    );
    return rows.length > 0;
  }

  /**
   * One page of records the sweeper must look at: PENDING untouched for `graceMs` (enqueue
   * failed or job lost) and PROCESSING with an expired lease (worker crashed). Keyset paging on
   * `(updatedAt, id)`; the timestamp travels as text to keep microsecond precision.
   *
   * @param graceMs - How long a PENDING record may sit untouched.
   * @param limit - Page size.
   * @param afterCursor - The last row of the previous page, or `null` for the first page.
   * @param transaction - The enclosing transaction, when there is one.
   * @returns The next page of stuck records.
   */
  public async findStuckRecords(
    graceMs: number,
    limit: number,
    afterCursor: StuckRecordCursorInterface | null,
    transaction?: Transaction,
  ): Promise<StuckRecordInterface[]> {
    return this.selectRows<StuckRecordInterface>(
      `SELECT "publicId" AS id, "classificationStatus" AS status, "retryGeneration",
              "attemptCount", "updatedAt"::text AS "updatedAtText"
         FROM "Record"
        WHERE (("classificationStatus" = $5 AND "updatedAt" < now() - ($1::int * interval '1 millisecond'))
               OR ("classificationStatus" = $6 AND "leaseExpiresAt" < now()))
          AND ($3::timestamptz IS NULL
               OR ("updatedAt", id) > ($3::timestamptz, (SELECT id FROM "Record" WHERE "publicId" = $4::uuid)))
        ORDER BY "Record"."updatedAt", "Record".id
        LIMIT $2`,
      [
        graceMs,
        limit,
        afterCursor?.updatedAtText ?? null,
        afterCursor?.id ?? null,
        RecordStatusEnum.PENDING,
        RecordStatusEnum.PROCESSING,
      ],
      transaction,
    );
  }
}
