import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/sequelize";
import { Transaction } from "sequelize";
import { Sequelize } from "sequelize-typescript";
import { SqlBaseRepository } from "../persistence/sql-base.repository";
import {
  RecordFilterInterface,
  RecordRowInterface,
} from "../../contracts/interfaces/sql-db/record/record-row.interface";
import { ClassificationRowInterface } from "../../contracts/interfaces/sql-db/classification/classification-row.interface";
import { ClassificationAttemptRowInterface } from "../../contracts/interfaces/sql-db/classification/classification-attempt-row.interface";

/** Reads records with their current classification, history and attempts, by public id. */
@Injectable()
export class RecordRepository extends SqlBaseRepository {
  private static readonly RECORD_COLUMNS = `
    r."publicId" AS id, r."externalId", r.source, r.title, r.description, r."recordDate",
    r."classificationStatus", r."failureKind",
    r."currentCategoryCode", c."publicId" AS "currentClassificationId",
    c.confidence AS "currentConfidence", r."retryGeneration", r."lastError",
    r."finishedAt", i."publicId" AS "importId", r."createdAt"`;

  private static readonly RECORD_JOINS = `
    "Record" r
    JOIN "Import" i ON i.id = r."createdByImportId"
    LEFT JOIN "Classification" c ON c.id = r."currentClassificationId"`;

  public constructor(@InjectConnection() sequelize: Sequelize) {
    super(sequelize);
  }

  /**
   * Finds one record.
   *
   * @param id - Public id of the record.
   * @param transaction - The enclosing transaction, when there is one.
   * @param isForUpdate - Locks the row for the rest of the transaction (review actions use it).
   * @returns The record, or `null` when it does not exist.
   */
  public async findById(
    id: string,
    transaction?: Transaction,
    isForUpdate = false,
  ): Promise<RecordRowInterface | null> {
    return this.selectOne<RecordRowInterface>(
      `SELECT ${RecordRepository.RECORD_COLUMNS}
         FROM ${RecordRepository.RECORD_JOINS}
        WHERE r."publicId" = $1::uuid ${isForUpdate ? "FOR UPDATE OF r" : ""}`,
      [id],
      transaction,
    );
  }

  /**
   * Keyset page ordered by `(recordDate DESC, publicId DESC)`, the one supported sort (indexed).
   *
   * Steps:
   * 1. Build the clauses and bound values of the filter.
   * 2. Add the keyset clause for the page cursor.
   * 3. Bind the limit and run the query.
   *
   * @param filter - Optional filters.
   * @param after - The last row of the previous page (`id` is a public id), or `null`.
   * @param limit - Page size.
   * @param transaction - The enclosing transaction, when there is one.
   * @returns The next page of records.
   */
  public async findPage(
    filter: RecordFilterInterface,
    after: { recordDate: Date; id: string } | null,
    limit: number,
    transaction?: Transaction,
  ): Promise<RecordRowInterface[]> {
    // 1. Build the clauses and bound values of the filter.
    const { clauses, bindValues } = RecordRepository.buildFilterClauses(filter);

    // 2. Add the keyset clause for the page cursor.
    if (after) {
      bindValues.push(after.recordDate.toISOString(), after.id);
      clauses.push(
        `(r."recordDate", r."publicId") < ($${bindValues.length - 1}::timestamptz, $${bindValues.length}::uuid)`,
      );
    }

    // 3. Bind the limit and run the query.
    bindValues.push(limit);
    return this.selectRows<RecordRowInterface>(
      `SELECT ${RecordRepository.RECORD_COLUMNS}
         FROM ${RecordRepository.RECORD_JOINS}
        ${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""}
        ORDER BY r."recordDate" DESC, r."publicId" DESC
        LIMIT $${bindValues.length}`,
      bindValues,
      transaction,
    );
  }

  /**
   * Every classification of the record, oldest first (the history chain).
   *
   * @param recordId - Public id of the record.
   * @param transaction - The enclosing transaction, when there is one.
   * @returns The classifications, with public ids.
   */
  public async findClassificationHistory(
    recordId: string,
    transaction?: Transaction,
  ): Promise<ClassificationRowInterface[]> {
    return this.selectRows<ClassificationRowInterface>(
      `SELECT c."publicId" AS id, r."publicId" AS "recordId", c.kind, c."categoryCode", c.confidence,
              c."isReviewNeeded", c.classifier, c."rawOutput", c.reason, c."reviewedBy",
              s."publicId" AS "supersedesId", c."createdAt"
         FROM "Classification" c
         JOIN "Record" r ON r.id = c."recordId"
         LEFT JOIN "Classification" s ON s.id = c."supersedesId"
        WHERE r."publicId" = $1::uuid
        ORDER BY c."createdAt" ASC, c.id ASC`,
      [recordId],
      transaction,
    );
  }

  /**
   * Every classification attempt of the record, in the order they ran.
   *
   * @param recordId - Public id of the record.
   * @param transaction - The enclosing transaction, when there is one.
   * @returns The attempts.
   */
  public async findAttempts(recordId: string, transaction?: Transaction): Promise<ClassificationAttemptRowInterface[]> {
    return this.selectRows<ClassificationAttemptRowInterface>(
      `SELECT a."retryGeneration", a."attemptNo", a.outcome, a.error, a."durationMs", a."createdAt"
         FROM "ClassificationAttempt" a
        WHERE a."recordId" = (SELECT id FROM "Record" WHERE "publicId" = $1::uuid)
        ORDER BY a."retryGeneration" ASC, a."attemptNo" ASC`,
      [recordId],
      transaction,
    );
  }

  /**
   * Turns the filter into `WHERE` clauses with their bound values; only the filters that are set add a clause.
   *
   * Steps:
   * 1. Prepare the clause list, the bound values and the clause adder.
   * 2. Add one clause for each filter that is set.
   * 3. Return the clauses and the values.
   *
   * @param filter - Optional filters.
   * @returns The clauses to join with `AND` and the values they bind, in order.
   */
  private static buildFilterClauses(filter: RecordFilterInterface): { clauses: string[]; bindValues: unknown[] } {
    // 1. Prepare the clause list, the bound values and the clause adder.
    const clauses: string[] = [];
    const bindValues: unknown[] = [];
    const addClause = (buildClause: (placeholder: string) => string, value: unknown): void => {
      bindValues.push(value);
      clauses.push(buildClause(`$${bindValues.length}`));
    };

    // 2. Add one clause for each filter that is set.
    if (filter.sourceKey !== undefined) {
      addClause((placeholder) => `r."sourceKey" = ${placeholder}`, filter.sourceKey);
    }
    if (filter.category !== undefined) {
      addClause((placeholder) => `r."currentCategoryCode" = ${placeholder}`, filter.category);
    }
    if (filter.statuses !== undefined) {
      addClause((placeholder) => `r."classificationStatus" = ANY(${placeholder}::text[])`, filter.statuses);
    }
    if (filter.dateFrom !== undefined) {
      addClause((placeholder) => `r."recordDate" >= ${placeholder}`, filter.dateFrom.toISOString());
    }
    if (filter.dateToExclusive !== undefined) {
      addClause((placeholder) => `r."recordDate" < ${placeholder}`, filter.dateToExclusive.toISOString());
    }
    if (filter.dateToInclusive !== undefined) {
      addClause((placeholder) => `r."recordDate" <= ${placeholder}`, filter.dateToInclusive.toISOString());
    }
    if (filter.importId !== undefined) {
      addClause(
        (placeholder) => `r."createdByImportId" = (SELECT id FROM "Import" WHERE "publicId" = ${placeholder}::uuid)`,
        filter.importId,
      );
    }
    if (filter.titleLike !== undefined) {
      addClause((placeholder) => `r.title ILIKE ${placeholder} ESCAPE '\\'`, filter.titleLike);
    }

    // 3. Return the clauses and the values.
    return { clauses, bindValues };
  }
}
