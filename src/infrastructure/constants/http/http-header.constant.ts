/** Request header that carries the shared API key (lower case, as Node exposes headers). */
export const API_KEY_HEADER = "x-api-key";

/** Response header set when a repeated request gets an earlier result back. */
export const IDEMPOTENT_REPLAYED_HEADER = "Idempotent-Replayed";

/** Value of {@link IDEMPOTENT_REPLAYED_HEADER} on a replay. */
export const IDEMPOTENT_REPLAYED_VALUE = "true";
