/** Limits on the error text stored with a record or an attempt. */
export const ATTEMPT_ERROR = {
  /** Longest error message kept, in characters; longer ones are cut. */
  MAX_STORED_LENGTH: 2000,
} as const;
