/** A record that passed validation, normalised and ready to store. */
export interface ValidRecordInterface {
  /** The caller's own identifier for the record, trimmed. */
  externalId: string;
  /** Normalised record title. */
  title: string;
  /** Normalised record description. */
  description: string;
  /** Name of the system the record came from. */
  source: string;
  /** Stable key of the source, used with `externalId` to detect duplicates. */
  sourceKey: string;
  /** Instant the record refers to, parsed from an ISO 8601 date with offset. */
  recordDate: Date;
  /** SHA-256 hex of the canonical record content, to tell a changed record from a repeat. */
  contentHash: string;
}
