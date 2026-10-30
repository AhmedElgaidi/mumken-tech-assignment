import { QueryTypes, Transaction } from "sequelize";
import { Sequelize } from "sequelize-typescript";
import { MISSING_ROW_MESSAGE } from "../../constants/sql-db/sql-db.constant";

/**
 * Owns the connection of every SQL repository and offers the few calls they share: open a
 * transaction, read rows, and run a statement. Values are always bound (`$1`, `$2`, …), never
 * concatenated into the SQL text.
 */
export abstract class SqlBaseRepository {
  public constructor(protected readonly sequelize: Sequelize) {}

  /**
   * Opens a transaction the caller commits or rolls back itself.
   *
   * @param parent - An open transaction to nest in as a savepoint, when there is one.
   * @returns The open transaction.
   */
  public async createTransaction(parent?: Transaction): Promise<Transaction> {
    return this.sequelize.transaction({ transaction: parent });
  }

  /**
   * Runs one parameterised statement and returns its rows (also for `UPDATE … RETURNING`).
   *
   * @param sql - The statement, with `$n` placeholders.
   * @param bind - The values for the placeholders, in order.
   * @param transaction - The enclosing transaction, when there is one.
   * @returns The returned rows.
   */
  protected async selectRows<T extends object>(
    sql: string,
    bind: unknown[] = [],
    transaction?: Transaction,
  ): Promise<T[]> {
    return this.sequelize.query<T>(sql, { bind, type: QueryTypes.SELECT, transaction, raw: true });
  }

  /**
   * Like `selectOne` but for a statement that must return a row, such as `INSERT … RETURNING`.
   *
   * Steps:
   * 1. Run the statement and take the first row.
   * 2. Fail fast when the statement returned no row.
   * 3. Return the row.
   *
   * @param sql - The statement, with `$n` placeholders.
   * @param bind - The values for the placeholders, in order.
   * @param transaction - The enclosing transaction, when there is one.
   * @returns The first row.
   * @throws Error when the statement returned no row.
   */
  protected async selectRequiredOne<T extends object>(
    sql: string,
    bind: unknown[] = [],
    transaction?: Transaction,
  ): Promise<T> {
    // 1. Run the statement and take the first row.
    const row = await this.selectOne<T>(sql, bind, transaction);

    // 2. Fail fast when the statement returned no row.
    if (row === null) {
      throw new Error(MISSING_ROW_MESSAGE);
    }

    // 3. Return the row.
    return row;
  }

  /**
   * Like `selectRows` but returns only the first row.
   *
   * @param sql - The statement, with `$n` placeholders.
   * @param bind - The values for the placeholders, in order.
   * @param transaction - The enclosing transaction, when there is one.
   * @returns The first row, or `null` when the statement returned none.
   */
  protected async selectOne<T extends object>(
    sql: string,
    bind: unknown[] = [],
    transaction?: Transaction,
  ): Promise<T | null> {
    const rows = await this.selectRows<T>(sql, bind, transaction);
    return rows[0] ?? null;
  }

  /**
   * Runs one parameterised statement whose result is not read.
   *
   * @param sql - The statement, with `$n` placeholders.
   * @param bind - The values for the placeholders, in order.
   * @param transaction - The enclosing transaction, when there is one.
   * @returns Resolves when the statement has finished.
   */
  protected async execute(sql: string, bind: unknown[] = [], transaction?: Transaction): Promise<void> {
    await this.sequelize.query(sql, { bind, transaction });
  }
}
