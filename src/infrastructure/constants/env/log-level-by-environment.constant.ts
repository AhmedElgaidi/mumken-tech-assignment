import { EnvironmentTypeEnum } from "../../contracts/enums/env/environment-type.enum";
import { LogLevelEnum } from "../../contracts/enums/env/log-level.enum";

/** Lowest log level written in each environment: detailed while building, quiet in tests, lean when live. */
export const LOG_LEVEL_BY_ENVIRONMENT: Readonly<Record<EnvironmentTypeEnum, LogLevelEnum>> = {
  [EnvironmentTypeEnum.LOCAL]: LogLevelEnum.DEBUG,
  [EnvironmentTypeEnum.DEVELOPMENT]: LogLevelEnum.DEBUG,
  [EnvironmentTypeEnum.STAGING]: LogLevelEnum.INFO,
  [EnvironmentTypeEnum.PRODUCTION]: LogLevelEnum.INFO,
  [EnvironmentTypeEnum.TEST]: LogLevelEnum.SILENT,
};

/**
 * Environments whose logs are printed in a readable form instead of JSON. Only a developer machine:
 * `pino-pretty` is a dev dependency and is not in the production image.
 */
export const PRETTY_LOG_ENVIRONMENTS: readonly EnvironmentTypeEnum[] = [EnvironmentTypeEnum.LOCAL];
