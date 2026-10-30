import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { EnvironmentVariablesDto } from "../contracts/dtos/environment-variables.dto";

/** Validates the environment once at startup (fail fast, never run half-configured). */
export class EnvironmentValidator {
  /**
   * `@nestjs/config` validate hook: checks every variable.
   *
   * Steps:
   * 1. Drop variables that are empty strings.
   * 2. Convert the rest to the typed configuration with defaults.
   * 3. Throw one error listing every problem, or return the configuration.
   *
   * @param rawEnvironment - The environment as read, every value still a string.
   * @returns The typed configuration with defaults applied.
   * @throws Error When a variable is invalid; every problem is listed.
   */
  public static validate(rawEnvironment: Record<string, unknown>): EnvironmentVariablesDto {
    // 1. Drop variables that are empty strings.
    const nonEmptyEnvironment = Object.fromEntries(
      Object.entries(rawEnvironment).filter(([, variableValue]) => variableValue !== ""),
    );

    // 2. Convert the rest to the typed configuration with defaults.
    const configuration = plainToInstance(EnvironmentVariablesDto, nonEmptyEnvironment, { exposeDefaultValues: true });

    // 3. Throw one error listing every problem, or return the configuration.
    const validationErrors = validateSync(configuration, { skipMissingProperties: false });
    if (validationErrors.length > 0) {
      const problemLines = validationErrors.map(
        (error) => `${error.property}: ${Object.values(error.constraints ?? {}).join(", ")}`,
      );
      throw new Error(`Invalid environment configuration:\n  ${problemLines.join("\n  ")}`);
    }
    return configuration;
  }
}
