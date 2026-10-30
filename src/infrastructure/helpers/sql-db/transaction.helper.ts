import { Transaction } from "sequelize";

/** Helpers for explicit transactions. */
export class TransactionHelper {
  /**
   * Rolls a transaction back without letting a failing rollback hide the error being handled.
   *
   * Steps:
   * 1. Roll the transaction back.
   * 2. Ignore a rollback failure; the caller rethrows the original error.
   *
   * @param transaction - The open transaction to abandon.
   * @returns Resolves when the rollback has finished or failed.
   */
  public static async rollbackQuietly(transaction: Transaction): Promise<void> {
    try {
      // 1. Roll the transaction back.
      await transaction.rollback();
    } catch {
      // 2. Ignore a rollback failure; the caller rethrows the original error.
    }
  }
}
