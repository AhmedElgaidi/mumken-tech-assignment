import { Injectable } from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/sequelize";
import { Transaction } from "sequelize";
import { Sequelize } from "sequelize-typescript";
import { SqlBaseRepository } from "../persistence/sql-base.repository";
import { INSERT_CHUNK_SIZE } from "../../../modules/import/constants/import.constant";
import { RecordStatusEnum } from "../../../modules/classification/contracts/enums/lifecycle/record-status.enum";
import { ImportItemOutcomeEnum } from "../../../modules/import/contracts/enums/import-item-outcome.enum";
import { ValidRecordInterface } from "../../../modules/import/contracts/interfaces/item/valid-record.interface";
import { ImportCountUtil } from "../../utils/sql-db/import-count.util";
import { ImportModel } from "../../models/import.model";
import { SQL_COLUMN_LIMITS } from "../../constants/sql-db/sql-db.constant";
import {
  ImportCountsInterface,
  ImportItemRowInterface,
  ImportRowInterface,
  StoredKeyInterface,
} from "../../contracts/interfaces/sql-db/import/import-row.interface";

/**
 * Reads and writes imports, their items and the records they create. Callers pass and receive
 * public ids; the internal `bigint` ids are resolved inside the SQL.
 */
@Injectable()
export class ImportRepository extends SqlBaseRepository {
  public constructor(
    @InjectConnection() sequelize: Sequelize,
    @InjectModel(ImportModel) private readonly imports: typeof ImportModel,
  ) {
    super(sequelize);
  }

  /**
   * Finds an import by its public id.
   *
   * @param id - Public id of the import.
   * @param transaction - The enclosing transaction, when there is one.
   * @returns The import, or `null` when it does not exist.
   */
  public async findById(id: string, transaction?: Transaction): Promise<ImportRowInterface | null> {
    const row = await this.imports.findOne({ where: { publicId: id }, raw: true, transaction });
    return row ? ImportRepository.toImportRow(row) : null;
  }

  /**
   * Finds an import by the client's idempotency key.
   *
   * @param key - The `Idempotency-Key` value.
   * @param transaction - The enclosing transaction, when there is one.
   * @returns The import, or `null` when the key was never used.
   */
  public async findByIdempotencyKey(key: string, transaction?: Transaction): Promise<ImportRowInterface | null> {
    const row = await this.imports.findOne({
      where: { idempotencyKey: key },
      raw: true,
      transaction,
    });
    return row ? ImportRepository.toImportRow(row) : null;
  }

  /**
   * Inserts the import row. Throws a unique violation on `IMPORT_IDEMPOTENCY_KEY_CONSTRAINT`
   * when the key is already used.
   *
   * @param transaction - The enclosing transaction.
   * @param values - The import envelope.
   * @returns The public id of the new import.
   */
  public async createImport(
    transaction: Transaction,
    values: { idempotencyKey: string | null; requestHash: string; totalItems: number },
  ): Promise<string> {
    const row = await this.selectRequiredOne<{ id: string }>(
      `INSERT INTO "Import" ("idempotencyKey", "requestHash", "totalItems") VALUES ($1, $2, $3) RETURNING "publicId" AS id`,
      [values.idempotencyKey, values.requestHash, values.totalItems],
      transaction,
    );
    return row.id;
  }

  /**
   * Inserts the candidates in the given (sorted) order; existing keys are skipped by
   * `ON CONFLICT DO NOTHING`.
   *
   * Steps:
   * 1. Start with an empty list of created rows.
   * 2. Insert the records chunk by chunk and collect the rows created.
   * 3. Return the created rows.
   *
   * @param transaction - The enclosing transaction.
   * @param importId - Public id of the creating import.
   * @param records - The validated records, already sorted.
   * @returns Only the rows this statement created.
   */
  public async insertRecords(
    transaction: Transaction,
    importId: string,
    records: ValidRecordInterface[],
  ): Promise<StoredKeyInterface[]> {
    // 1. Start with an empty list of created rows.
    const created: StoredKeyInterface[] = [];

    // 2. Insert the records chunk by chunk and collect the rows created.
    for (let start = 0; start < records.length; start += INSERT_CHUNK_SIZE) {
      const chunk = records.slice(start, start + INSERT_CHUNK_SIZE);
      const rows = await this.selectRows<StoredKeyInterface>(
        `INSERT INTO "Record" (source, "sourceKey", "externalId", title, description, "recordDate", "contentHash", "createdByImportId")
         SELECT s, sk, e, t, d, rd, h, (SELECT id FROM "Import" WHERE "publicId" = $8::uuid)
           FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::timestamptz[], $7::text[])
                WITH ORDINALITY AS u(s, sk, e, t, d, rd, h, n)
          ORDER BY n
         ON CONFLICT ("sourceKey", "externalId") DO NOTHING
         RETURNING "publicId" AS id, "sourceKey", "externalId", "contentHash"`,
        [
          chunk.map((record) => record.source),
          chunk.map((record) => record.sourceKey),
          chunk.map((record) => record.externalId),
          chunk.map((record) => record.title),
          chunk.map((record) => record.description),
          chunk.map((record) => record.recordDate.toISOString()),
          chunk.map((record) => record.contentHash),
          importId,
        ],
        transaction,
      );
      created.push(...rows);
    }

    // 3. Return the created rows.
    return created;
  }

  /**
   * Looks up stored records by their `(sourceKey, externalId)` identity.
   *
   * @param transaction - The enclosing transaction.
   * @param keys - The identities to look up.
   * @returns The records that exist.
   */
  public async findRecordsByKeys(
    transaction: Transaction,
    keys: Array<{ sourceKey: string; externalId: string }>,
  ): Promise<StoredKeyInterface[]> {
    if (keys.length === 0) {
      return [];
    }
    return this.selectRows<StoredKeyInterface>(
      `SELECT r."publicId" AS id, r."sourceKey", r."externalId", r."contentHash"
         FROM "Record" r
         JOIN unnest($1::text[], $2::text[]) AS k(sk, e) ON r."sourceKey" = k.sk AND r."externalId" = k.e`,
      [keys.map((key) => key.sourceKey), keys.map((key) => key.externalId)],
      transaction,
    );
  }

  /**
   * Inserts the per-item verdicts of an import. Echoed `externalId` and `source` are cut to
   * the column widths, because an INVALID item may carry an over-long value.
   *
   * @param transaction - The enclosing transaction.
   * @param importId - Public id of the import.
   * @param items - The item verdicts; `recordId` is a record public id.
   */
  public async insertItems(transaction: Transaction, importId: string, items: ImportItemRowInterface[]): Promise<void> {
    for (let start = 0; start < items.length; start += INSERT_CHUNK_SIZE) {
      const chunk = items.slice(start, start + INSERT_CHUNK_SIZE);
      await this.execute(
        `INSERT INTO "ImportItem" ("importId", "itemIndex", "externalId", source, outcome, errors, warnings,
                                   "duplicateOfIndex", "hasContentChanged", "recordId")
         SELECT (SELECT id FROM "Import" WHERE "publicId" = $1::uuid), u.i, u.e, u.s, u.o, u.er::jsonb, u.w::jsonb, u.di, u.cc, r.id
           FROM unnest($2::int[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::int[], $9::boolean[], $10::uuid[])
                AS u(i, e, s, o, er, w, di, cc, rid)
           LEFT JOIN "Record" r ON r."publicId" = u.rid`,
        [
          importId,
          chunk.map((item) => item.index),
          chunk.map((item) => item.externalId?.slice(0, SQL_COLUMN_LIMITS.externalId) ?? null),
          chunk.map((item) => item.source?.slice(0, SQL_COLUMN_LIMITS.source) ?? null),
          chunk.map((item) => item.outcome),
          chunk.map((item) => (item.errors ? JSON.stringify(item.errors) : null)),
          chunk.map((item) => (item.warnings && item.warnings.length > 0 ? JSON.stringify(item.warnings) : null)),
          chunk.map((item) => item.duplicateOfIndex),
          chunk.map((item) => item.hasContentChanged),
          chunk.map((item) => item.recordId),
        ],
        transaction,
      );
    }
  }

  /**
   * Items of an import in index order.
   *
   * @param importId - Public id of the import.
   * @param options - `outcomes` filters, `afterIndex` is the keyset cursor, `limit` caps the page.
   * @param transaction - The enclosing transaction, when there is one.
   * @returns The matching items.
   */
  public async listItems(
    importId: string,
    options: { outcomes?: ImportItemOutcomeEnum[]; afterIndex?: number; limit?: number } = {},
    transaction?: Transaction,
  ): Promise<ImportItemRowInterface[]> {
    return this.selectRows<ImportItemRowInterface>(
      `SELECT ii."itemIndex" AS index, ii.outcome, ii."externalId", ii.source, ii.errors, ii.warnings,
              r."publicId" AS "recordId", ii."duplicateOfIndex", ii."hasContentChanged"
         FROM "ImportItem" ii LEFT JOIN "Record" r ON r.id = ii."recordId"
        WHERE ii."importId" = (SELECT id FROM "Import" WHERE "publicId" = $1::uuid)
          AND ($2::text[] IS NULL OR ii.outcome = ANY($2::text[]))
          AND ($3::int IS NULL OR ii."itemIndex" > $3)
        ORDER BY ii."itemIndex"
        LIMIT $4`,
      [importId, options.outcomes ?? null, options.afterIndex ?? null, options.limit ?? null],
      transaction,
    );
  }

  /**
   * Counts on read (two grouped queries): always correct, no counters to drift.
   *
   * Steps:
   * 1. Run the item count and the record count together.
   * 2. Fill the item counts by outcome.
   * 3. Fill the record counts by status and find the latest finish time.
   * 4. Return the counts.
   *
   * @param importId - Public id of the import.
   * @param transaction - The enclosing transaction, when there is one.
   * @returns Item counts by outcome, record counts by status and the latest finish time.
   */
  public async countByImport(importId: string, transaction?: Transaction): Promise<ImportCountsInterface> {
    // 1. Run the item count and the record count together.
    const [itemRows, recordRows] = await Promise.all([
      this.selectRows<{ outcome: ImportItemOutcomeEnum; count: number }>(
        `SELECT outcome, count(*)::int AS count FROM "ImportItem"
          WHERE "importId" = (SELECT id FROM "Import" WHERE "publicId" = $1::uuid) GROUP BY outcome`,
        [importId],
        transaction,
      ),
      this.selectRows<{
        status: RecordStatusEnum;
        count: number;
        latestFinishedAt: Date | null;
      }>(
        `SELECT "classificationStatus" AS status, count(*)::int AS count, max("finishedAt") AS "latestFinishedAt"
           FROM "Record"
          WHERE "createdByImportId" = (SELECT id FROM "Import" WHERE "publicId" = $1::uuid)
          GROUP BY "classificationStatus"`,
        [importId],
        transaction,
      ),
    ]);

    // 2. Fill the item counts by outcome.
    const items = ImportCountUtil.createEmptyItemCounts();
    itemRows.forEach((row) => (items[row.outcome] = row.count));

    // 3. Fill the record counts by status and find the latest finish time.
    const records = ImportCountUtil.createEmptyRecordCounts();
    let latestFinishedAt: Date | null = null;
    recordRows.forEach((row) => {
      records[row.status] = row.count;
      if (row.latestFinishedAt && (!latestFinishedAt || row.latestFinishedAt > latestFinishedAt)) {
        latestFinishedAt = row.latestFinishedAt;
      }
    });

    // 4. Return the counts.
    return { items, records, latestFinishedAt };
  }

  private static toImportRow(row: ImportModel): ImportRowInterface {
    return {
      id: row.publicId,
      idempotencyKey: row.idempotencyKey,
      requestHash: row.requestHash,
      totalItems: row.totalItems,
      createdAt: row.createdAt,
    };
  }
}
