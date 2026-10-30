import { EnvironmentTypeEnum } from "../../contracts/enums/env/environment-type.enum";
import { LogLevelEnum } from "../../contracts/enums/env/log-level.enum";
import { DEFAULT_NODE_ENV } from "./environment-default.constant";
import { LOG_LEVEL_BY_ENVIRONMENT, PRETTY_LOG_ENVIRONMENTS } from "./log-level-by-environment.constant";

describe("LOG_LEVEL_BY_ENVIRONMENT", () => {
  it("logs in detail while building, stays quiet in tests and lean when live", () => {
    expect(LOG_LEVEL_BY_ENVIRONMENT).toEqual({
      [EnvironmentTypeEnum.LOCAL]: LogLevelEnum.DEBUG,
      [EnvironmentTypeEnum.DEVELOPMENT]: LogLevelEnum.DEBUG,
      [EnvironmentTypeEnum.STAGING]: LogLevelEnum.INFO,
      [EnvironmentTypeEnum.PRODUCTION]: LogLevelEnum.INFO,
      [EnvironmentTypeEnum.TEST]: LogLevelEnum.SILENT,
    });
  });

  it("prints readable logs only on a developer machine, which is also the default environment", () => {
    expect(PRETTY_LOG_ENVIRONMENTS).toEqual([EnvironmentTypeEnum.LOCAL]);
    expect(DEFAULT_NODE_ENV).toBe(EnvironmentTypeEnum.LOCAL);
  });
});
