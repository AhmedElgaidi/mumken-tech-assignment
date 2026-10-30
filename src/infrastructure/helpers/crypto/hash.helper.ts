import { createHash } from "node:crypto";

/** SHA-256 digests of text and of JSON values. */
export class HashHelper {
  /**
   * Hashes text with SHA-256.
   *
   * @param text - The text to hash.
   * @returns The 64-character lower-case hex digest.
   */
  public static sha256(text: string): string {
    return createHash("sha256").update(text).digest("hex");
  }

  /**
   * Hashes a value as JSON with object keys sorted, so equal data gives equal hashes.
   *
   * @param value - Any JSON-serialisable value.
   * @returns The SHA-256 hex digest; array order matters, object key order does not.
   */
  public static hashJson(value: unknown): string {
    return HashHelper.sha256(JSON.stringify(HashHelper.sortKeysDeep(value)));
  }

  /**
   * Rebuilds a value with object keys sorted at every level.
   *
   * Steps:
   * 1. Sort each entry of an array.
   * 2. Rebuild an object with its keys in order and sorted values.
   * 3. Return any other value unchanged.
   *
   * @param value - Any JSON-serialisable value.
   * @returns The same data with sorted object keys.
   */
  private static sortKeysDeep(value: unknown): unknown {
    // 1. Sort each entry of an array.
    if (Array.isArray(value)) {
      return value.map((entry) => HashHelper.sortKeysDeep(entry));
    }

    // 2. Rebuild an object with its keys in order and sorted values.
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, HashHelper.sortKeysDeep((value as Record<string, unknown>)[key])]),
      );
    }

    // 3. Return any other value unchanged.
    return value;
  }
}
