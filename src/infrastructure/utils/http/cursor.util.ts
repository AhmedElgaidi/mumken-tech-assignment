/**
 * Opaque cursors: base64url of a small JSON object. Clients must treat them as opaque; the
 * server rejects any cursor it cannot decode or that was issued for other filters.
 */
export class CursorUtil {
  /**
   * Encodes a payload as an opaque cursor.
   *
   * @param payload - The position and filter data to carry.
   * @returns The base64url cursor string.
   */
  public static encode(payload: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  }

  /**
   * Decodes a cursor back into its payload.
   *
   * @param cursor - A cursor string from a client.
   * @returns The decoded object, or `null` when the cursor is malformed.
   */
  public static decode(cursor: string): Record<string, unknown> | null {
    try {
      const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
      return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
}
