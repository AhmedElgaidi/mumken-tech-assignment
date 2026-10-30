/** The header a caller may send its own request id in (and the one echoed back). */
export const REQUEST_ID_HEADER = "x-request-id";

/** The header name written on the response, in its conventional casing. */
export const REQUEST_ID_RESPONSE_HEADER = "X-Request-Id";

/** An incoming request id is kept only when it is short and plain; anything else gets a new UUID. */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
