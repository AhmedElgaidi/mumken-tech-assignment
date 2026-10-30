/** Reads SQLSTATE details from a Sequelize error (`parent`/`original`) or a raw pg error. */
export class PostgresErrorUtil {
  /**
   * Reads the SQLSTATE code of a database error.
   *
   * Steps:
   * 1. Return nothing for a value that is not an object.
   * 2. Read the code from the wrapped or raw error.
   * 3. Return the code when it is a string.
   *
   * @param error - Any thrown value.
   * @returns The SQLSTATE string, or `undefined` when the value carries none.
   */
  public static getCode(error: unknown): string | undefined {
    // 1. Return nothing for a value that is not an object.
    if (error === null || typeof error !== "object") {
      return undefined;
    }

    // 2. Read the code from the wrapped or raw error.
    const candidate = error as {
      code?: unknown;
      parent?: { code?: unknown };
      original?: { code?: unknown };
    };
    const code = candidate.parent?.code ?? candidate.original?.code ?? candidate.code;

    // 3. Return the code when it is a string.
    return typeof code === "string" ? code : undefined;
  }

  /**
   * Reads the violated constraint name of a database error.
   *
   * Steps:
   * 1. Return nothing for a value that is not an object.
   * 2. Read the constraint from the wrapped error.
   * 3. Return the constraint when it is a string.
   *
   * @param error - Any thrown value.
   * @returns The constraint name, or `undefined` when the value carries none.
   */
  public static getConstraint(error: unknown): string | undefined {
    // 1. Return nothing for a value that is not an object.
    if (error === null || typeof error !== "object") {
      return undefined;
    }

    // 2. Read the constraint from the wrapped error.
    const candidate = error as {
      parent?: { constraint?: unknown };
      original?: { constraint?: unknown };
    };
    const constraint = candidate.parent?.constraint ?? candidate.original?.constraint;

    // 3. Return the constraint when it is a string.
    return typeof constraint === "string" ? constraint : undefined;
  }
}
