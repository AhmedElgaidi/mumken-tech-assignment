import { AppSettingsInterface } from "../../contracts/interfaces/settings/app-settings.interface";

/** The tuning values the service runs with. Tests replace them with faster ones. */
export const DEFAULT_APP_SETTINGS: AppSettingsInterface = {
  queue: { prefix: "bull", isConsumerEnabled: true },
  classification: {
    concurrency: 5,
    maxAttempts: 5,
    backoffMs: 2000,
    leaseMs: 20000,
    classifierTimeoutMs: 5000,
    reviewThreshold: 0.7,
  },
  sweeper: { intervalMs: 60000, batchSize: 200, pendingGraceMs: 30000 },
  import: { maxRecords: 500, maxBodyBytes: "10mb" },
};
