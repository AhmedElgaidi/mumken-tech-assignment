import { ConfigService } from "@nestjs/config";
import { AppConfigService } from "./app-config.service";
import { EnvironmentVariablesDto } from "../../contracts/dtos/environment-variables.dto";
import { EnvironmentTypeEnum } from "../../contracts/enums/env/environment-type.enum";
import { LogLevelEnum } from "../../contracts/enums/env/log-level.enum";

describe("AppConfigService", () => {
  const serviceWith = (values: Partial<Record<keyof EnvironmentVariablesDto, unknown>>): AppConfigService => {
    const config = { get: jest.fn((key: string) => (values as Record<string, unknown>)[key]) };
    return new AppConfigService(config as unknown as ConfigService<EnvironmentVariablesDto, true>);
  };

  it("reads each validated value", () => {
    const service = serviceWith({
      PORT: 4000,
      DATABASE_URL: "postgres://db",
      REDIS_URL: "redis://cache",
      API_KEY: "key",
    });

    expect(service.getPort()).toBe(4000);
    expect(service.getDatabaseUrl()).toBe("postgres://db");
    expect(service.getRedisUrl()).toBe("redis://cache");
    expect(service.getApiKey()).toBe("key");
  });

  it("returns an unset API key as undefined", () => {
    expect(serviceWith({}).getApiKey()).toBeUndefined();
  });

  it.each([
    [EnvironmentTypeEnum.LOCAL, LogLevelEnum.DEBUG],
    [EnvironmentTypeEnum.DEVELOPMENT, LogLevelEnum.DEBUG],
    [EnvironmentTypeEnum.STAGING, LogLevelEnum.INFO],
    [EnvironmentTypeEnum.PRODUCTION, LogLevelEnum.INFO],
    [EnvironmentTypeEnum.TEST, LogLevelEnum.SILENT],
  ])("derives the log level for %s", (environment, level) => {
    expect(serviceWith({ NODE_ENV: environment }).getLogLevel()).toBe(level);
  });

  it("uses pretty logging only in local", () => {
    for (const environment of Object.values(EnvironmentTypeEnum)) {
      expect(serviceWith({ NODE_ENV: environment }).isPrettyLogging()).toBe(environment === EnvironmentTypeEnum.LOCAL);
    }
  });

  it("detects production", () => {
    expect(serviceWith({ NODE_ENV: EnvironmentTypeEnum.PRODUCTION }).isProduction()).toBe(true);
    expect(serviceWith({ NODE_ENV: EnvironmentTypeEnum.STAGING }).isProduction()).toBe(false);
  });
});
