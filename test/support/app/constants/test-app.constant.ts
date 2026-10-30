import { AppSettingsOverrideType } from "../contracts/types/app-settings-override.type";

/** Time allowed for the queue to drain (obliterate) before a truncate or close, in milliseconds. */
export const QUEUE_OBLITERATE_TIMEOUT_MS = 2000;

/** Time allowed for in-flight classification jobs to finish before a truncate, in milliseconds. */
export const PROCESSING_DRAIN_TIMEOUT_MS = 5000;

/** How many times `truncateAll` tries before it gives up (TRUNCATE can deadlock with a live worker). */
export const TRUNCATE_MAX_ATTEMPTS = 5;

/** Pause between two `truncateAll` attempts, in milliseconds. */
export const TRUNCATE_RETRY_DELAY_MS = 100;

/** Length of the random suffix that gives each test app its own queue prefix. */
export const QUEUE_PREFIX_SUFFIX_LENGTH = 8;

/**
 * Tables wiped between tests, children first. `Category` is seeded at boot and is never wiped.
 */
export const TRUNCATED_TABLES = ["ClassificationAttempt", "Classification", "ImportItem", "Record", "Import"] as const;

/** Length of the random suffix of a generated record `externalId`. */
export const EXTERNAL_ID_SUFFIX_LENGTH = 8;

/** Classifier attempts per retry generation in tests, so exhaustion is reached quickly. */
export const TEST_MAX_ATTEMPTS = 3;

/** Lease length in tests, in milliseconds: long enough for one call, short enough to expire in a test. */
export const TEST_LEASE_MS = 2000;

/** Fast tuning values for tests: short backoff, lease and timeout, no sweeper schedule, no grace. */
export const TEST_APP_SETTINGS: AppSettingsOverrideType = {
  classification: { backoffMs: 20, maxAttempts: TEST_MAX_ATTEMPTS, leaseMs: TEST_LEASE_MS, classifierTimeoutMs: 500 },
  sweeper: { intervalMs: 3600000, pendingGraceMs: 0 },
};
