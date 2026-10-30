import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/sequelize";
import { Transaction } from "sequelize";
import { Sequelize } from "sequelize-typescript";
import { SqlBaseRepository } from "../persistence/sql-base.repository";
import { RecordStatusEnum } from "../../../modules/classification/contracts/enums/lifecycle/record-status.enum";
import { ManualClassificationRowInterface } from "../../contracts/interfaces/sql-db/classification/manual-classification-row.interface";

/** Writes of human review: append a classification row, then point the record at it. */
@Injectable()
export class ReviewRepository extends SqlBaseRepository {
  public constructor(@InjectConnection() sequelize: Sequelize) {
    super(sequelize);
  }

  /**
   * Appends a manual classification row.
   *
   * @param transaction - The enclosing transaction.
   * @param values - The reviewer's classification, with public ids.
   * @returns The public id of the new classification.
   */
  public async insertManualClassification(
    transaction: Transaction,
    values: ManualClassificationRowInterface,
  ): Promise<string> {
    const insertedRow = await this.selectRequiredOne<{ id: string }>(
      `INSERT INTO "Classification" ("recordId", kind, "categoryCode", "isReviewNeeded", reason, "reviewedBy", "supersedesId")
       VALUES ((SELECT id FROM "Record" WHERE "publicId" = $1::uuid), $2, $3, false, $4, $5,
               (SELECT id FROM "Classification" WHERE "publicId" = $6::uuid))
       RETURNING "publicId" AS id`,
      [values.recordId, values.kind, values.categoryCode, values.reason, values.reviewedBy, values.supersedesId],
      transaction,
    );
    return insertedRow.id;
  }

  /**
   * Conditional update: applies only if the record is still in an allowed status and still
   * points at the classification the reviewer saw.
   *
   * @param transaction - The enclosing transaction.
   * @param recordId - Public id of the record.
   * @param classificationId - Public id of the new current classification.
   * @param categoryCode - Category copied onto the record.
   * @param expectedCurrentClassificationId - Public id of the classification the reviewer saw, or `null`.
   * @param allowedFrom - Statuses the record may be in for the update to apply.
   * @returns `false` when someone changed the record first.
   */
  public async applyToRecord(
    transaction: Transaction,
    recordId: string,
    classificationId: string,
    categoryCode: string,
    expectedCurrentClassificationId: string | null,
    allowedFrom: RecordStatusEnum[],
  ): Promise<boolean> {
    const updatedRows = await this.selectRows<{ id: string }>(
      `UPDATE "Record"
          SET "classificationStatus" = $6,
              "currentClassificationId" = (SELECT id FROM "Classification" WHERE "publicId" = $2::uuid),
              "currentCategoryCode" = $3, "failureKind" = NULL, "finishedAt" = now()
        WHERE "publicId" = $1::uuid AND "classificationStatus" = ANY($5::text[])
          AND "currentClassificationId" IS NOT DISTINCT FROM
              (SELECT id FROM "Classification" WHERE "publicId" = $4::uuid)
        RETURNING "publicId" AS id`,
      [
        recordId,
        classificationId,
        categoryCode,
        expectedCurrentClassificationId,
        allowedFrom,
        RecordStatusEnum.CLASSIFIED,
      ],
      transaction,
    );
    return updatedRows.length > 0;
  }
}
