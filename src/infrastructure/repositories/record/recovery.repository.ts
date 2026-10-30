import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/sequelize";
import { Transaction } from "sequelize";
import { Sequelize } from "sequelize-typescript";
import { SqlBaseRepository } from "../persistence/sql-base.repository";
import { RecoveryRemainingInterface } from "../../contracts/interfaces/sql-db/record/recovery-remaining.interface";
import { FailureKindEnum } from "../../../modules/classification/contracts/enums/lifecycle/failure-kind.enum";
import { RecordStatusEnum } from "../../../modules/classification/contracts/enums/lifecycle/record-status.enum";
import { RecordTriggerEnum } from "../../../modules/classification/contracts/enums/lifecycle/record-trigger.enum";
import { RecordStatusMachineUtil } from "../../../modules/classification/utils/record-status-machine.util";
import { RequeuedRecordInterface } from "../../contracts/interfaces/sql-db/record/requeued-record.interface";

/**
 * The retry statement: only FAILED records with a retryable failure kind move back to PENDING,
 * in a new retry generation with a fresh attempt budget. It never inserts records and never
 * touches CLASSIFIED or NEEDS_REVIEW, so successful work is not repeated.
 */
@Injectable()
export class RecoveryRepository extends SqlBaseRepository {
  public constructor(@InjectConnection() sequelize: Sequelize) {
    super(sequelize);
  }

  /**
   * Moves retryable FAILED records back to PENDING in a new retry generation.
   *
   * Steps:
   * 1. Choose the failure kinds to retry.
   * 2. Find out whether the scope is an import or one record.
   * 3. Requeue the matching records and return them.
   *
   * @param scope - Every record of an import (public id) or one record (public id).
   * @param isForced - Whether PERMANENT failures are retried too.
   * @param transaction - The enclosing transaction, when there is one.
   * @returns The records that were requeued.
   */
  public async requeueFailedRecords(
    scope: { importId: string } | { recordId: string },
    isForced: boolean,
    transaction?: Transaction,
  ): Promise<RequeuedRecordInterface[]> {
    // 1. Choose the failure kinds to retry.
    const retryableFailureKinds = isForced
      ? [FailureKindEnum.TRANSIENT_EXHAUSTED, FailureKindEnum.PERMANENT]
      : [FailureKindEnum.TRANSIENT_EXHAUSTED];

    // 2. Find out whether the scope is an import or one record.
    const isScopedToImport = "importId" in scope;

    // 3. Requeue the matching records and return them.
    return this.selectRows<RequeuedRecordInterface>(
      `UPDATE "Record"
          SET "classificationStatus" = $4, "failureKind" = NULL, "retryGeneration" = "retryGeneration" + 1,
              "attemptCount" = 0, "finishedAt" = NULL
        WHERE ${
          isScopedToImport
            ? `"createdByImportId" = (SELECT id FROM "Import" WHERE "publicId" = $1::uuid)`
            : `"publicId" = $1::uuid`
        }
          AND "classificationStatus" = ANY($2::text[]) AND "failureKind" = ANY($3::text[])
        RETURNING "publicId" AS id, "retryGeneration"`,
      [
        isScopedToImport ? scope.importId : scope.recordId,
        RecordStatusMachineUtil.getFromStatuses(RecordTriggerEnum.RETRY),
        retryableFailureKinds,
        RecordStatusEnum.PENDING,
      ],
      transaction,
    );
  }

  /**
   * What a retry of the import left alone, by reason.
   *
   * Steps:
   * 1. Count the import's records by status and failure kind.
   * 2. Prepare a helper that sums the rows matching a rule.
   * 3. Return the counts by reason.
   *
   * @param importId - Public id of the import.
   * @param transaction - The enclosing transaction, when there is one.
   * @returns Record counts by reason.
   */
  public async countRemaining(importId: string, transaction?: Transaction): Promise<RecoveryRemainingInterface> {
    // 1. Count the import's records by status and failure kind.
    const rows = await this.selectRows<{
      status: RecordStatusEnum;
      failureKind: FailureKindEnum | null;
      count: number;
    }>(
      `SELECT "classificationStatus" AS status, "failureKind", count(*)::int AS count
         FROM "Record"
        WHERE "createdByImportId" = (SELECT id FROM "Import" WHERE "publicId" = $1::uuid)
        GROUP BY "classificationStatus", "failureKind"`,
      [importId],
      transaction,
    );

    // 2. Prepare a helper that sums the rows matching a rule.
    const sumCounts = (isMatch: (row: (typeof rows)[number]) => boolean): number =>
      rows.filter(isMatch).reduce((total, row) => total + row.count, 0);

    // 3. Return the counts by reason.
    return {
      permanent: sumCounts((row) => row.failureKind === FailureKindEnum.PERMANENT),
      classified: sumCounts((row) => row.status === RecordStatusEnum.CLASSIFIED),
      needsReview: sumCounts((row) => row.status === RecordStatusEnum.NEEDS_REVIEW),
      inProgress: sumCounts(
        (row) => row.status === RecordStatusEnum.PENDING || row.status === RecordStatusEnum.PROCESSING,
      ),
    };
  }
}
