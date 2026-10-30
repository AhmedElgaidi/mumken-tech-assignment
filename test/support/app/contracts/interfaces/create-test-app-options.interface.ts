import { AppSettingsOverrideType } from "../types/app-settings-override.type";

/** Options for `TestAppHelper.create`. */
export interface CreateTestAppOptionsInterface {
  /** When `false`, the worker providers exist but no BullMQ consumer starts; tests drive them. */
  runWorkers?: boolean;

  /** Settings that replace the fast test defaults. */
  settings?: AppSettingsOverrideType;

  /** Environment variables applied before the app is built (only the real ones, such as `REDIS_URL`). */
  env?: Record<string, string>;
}
