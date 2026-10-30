import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  LOG_LEVEL_BY_ENVIRONMENT,
  PRETTY_LOG_ENVIRONMENTS,
} from "../../constants/env/log-level-by-environment.constant";
import { EnvironmentVariablesDto } from "../../contracts/dtos/environment-variables.dto";
import { EnvironmentTypeEnum } from "../../contracts/enums/env/environment-type.enum";
import { LogLevelEnum } from "../../contracts/enums/env/log-level.enum";

/** Typed, intention-revealing read access to the validated environment. */
@Injectable()
export class AppConfigService {
  public constructor(private readonly config: ConfigService<EnvironmentVariablesDto, true>) {}

  /**
   * Tells whether the process runs in production.
   *
   * @returns True when the environment is `production`.
   */
  public isProduction(): boolean {
    return this.read("NODE_ENV") === EnvironmentTypeEnum.PRODUCTION;
  }

  /**
   * Tells whether logs are printed in a readable form instead of JSON.
   *
   * @returns True only in the `local` environment.
   */
  public isPrettyLogging(): boolean {
    return PRETTY_LOG_ENVIRONMENTS.includes(this.read("NODE_ENV"));
  }

  /**
   * Gets the lowest log level written, derived from the environment.
   *
   * @returns `debug` for local and development, `info` for staging and production, `silent` for test.
   */
  public getLogLevel(): LogLevelEnum {
    return LOG_LEVEL_BY_ENVIRONMENT[this.read("NODE_ENV")];
  }

  /**
   * Gets the HTTP port the API listens on.
   *
   * @returns The validated port (3000 when it was unset).
   */
  public getPort(): number {
    return this.read("PORT");
  }

  /**
   * Gets the PostgreSQL connection URL.
   *
   * @returns The validated `postgres://` URL.
   */
  public getDatabaseUrl(): string {
    return this.read("DATABASE_URL");
  }

  /**
   * Gets the Redis connection URL used by the queues.
   *
   * @returns The validated `redis://` URL.
   */
  public getRedisUrl(): string {
    return this.read("REDIS_URL");
  }

  /**
   * Gets the shared secret for the `X-API-Key` header.
   *
   * @returns The secret, or undefined or empty when the check is switched off.
   */
  public getApiKey(): string | undefined {
    return this.read("API_KEY");
  }

  /**
   * Reads one validated environment variable.
   *
   * @param key - The variable name.
   * @returns The validated, typed value (the documented default when it was unset).
   */
  private read<TKey extends keyof EnvironmentVariablesDto>(key: TKey): EnvironmentVariablesDto[TKey] {
    return this.config.get(key, { infer: true });
  }
}
