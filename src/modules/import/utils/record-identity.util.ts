import { HashHelper } from "../../../infrastructure/helpers/crypto/hash.helper";

/** What makes a record the same record, and what makes its content the same content. */
export class RecordIdentityUtil {
  /**
   * The source half of a record's identity: the source, trimmed and lower-cased.
   *
   * @param source - The source as submitted or as filtered on.
   * @returns The comparable key; `Gov-News ` and `gov-news` give the same key.
   */
  public static getSourceKey(source: string): string {
    return source.trim().toLowerCase();
  }

  /**
   * Hash of the content a duplicate is compared on; `2026-10-25` and `2026-10-25T00:00:00Z` match.
   *
   * @param title - The normalised title.
   * @param description - The normalised description.
   * @param recordDate - The parsed record date.
   * @returns The canonical hash of title, description and the date as an ISO 8601 instant.
   */
  public static getContentHash(title: string, description: string, recordDate: Date): string {
    return HashHelper.hashJson({ title, description, date: recordDate.toISOString() });
  }
}
