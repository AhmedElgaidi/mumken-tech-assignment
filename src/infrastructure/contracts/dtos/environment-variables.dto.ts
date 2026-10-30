import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from "class-validator";
import { ToNumberTransform } from "../../transforms/to-number.transform";
import { POSTGRES_URL_PATTERN, REDIS_URL_PATTERN } from "../../constants/env/connection-url-pattern.constant";
import { DEFAULT_NODE_ENV, DEFAULT_PORT } from "../../constants/env/environment-default.constant";
import { EnvironmentTypeEnum } from "../enums/env/environment-type.enum";

/**
 * The environment variables the service reads: only what changes between deployments.
 * Tuning values (timeouts, limits, queue names) live in code (`DEFAULT_APP_SETTINGS`).
 * Validated once at startup; a bad value stops the process with a message naming the
 * variable (fail fast, never run half-configured).
 */
export class EnvironmentVariablesDto {
  /** Runtime environment: `local` and `development` print readable logs; `production` warns when `API_KEY` is empty. */
  @IsIn(Object.values(EnvironmentTypeEnum))
  public NODE_ENV: EnvironmentTypeEnum = DEFAULT_NODE_ENV;

  /** TCP port the HTTP server listens on. */
  @Transform(ToNumberTransform.apply)
  @IsInt()
  @Min(1)
  @Max(65535)
  public PORT: number = DEFAULT_PORT;

  /** PostgreSQL connection URL. */
  @IsString()
  @Matches(POSTGRES_URL_PATTERN)
  public DATABASE_URL!: string;

  /** Redis connection URL used by the queues. */
  @IsString()
  @Matches(REDIS_URL_PATTERN)
  public REDIS_URL!: string;

  /** Shared secret for the `X-API-Key` header; unset disables the check. */
  @IsOptional()
  @IsString()
  public API_KEY?: string;
}
