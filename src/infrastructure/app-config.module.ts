import { DynamicModule, Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppConfigService } from "./services/env/app-config.service";
import { EnvironmentValidator } from "./validators/environment.validator";

/** Global config module: validates the environment at startup and provides `AppConfigService`. */
@Global()
@Module({})
export class AppConfigModule {
  /**
   * Builds the config module when called (not at import time), so tests can set `process.env` first.
   *
   * @returns The dynamic module that validates the environment and provides `AppConfigService`.
   */
  public static forRoot(): DynamicModule {
    return {
      module: AppConfigModule,
      imports: [
        ConfigModule.forRoot({
          validate: (rawEnvironment) => EnvironmentValidator.validate(rawEnvironment),
          cache: true,
        }),
      ],
      providers: [AppConfigService],
      exports: [AppConfigService],
    };
  }
}
