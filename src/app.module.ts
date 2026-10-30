import { DynamicModule, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AppConfigModule } from "./infrastructure/app-config.module";
import { ApiKeyGuard } from "./infrastructure/guards/api-key.guard";
import { LoggingModule } from "./infrastructure/logging.module";
import { QueueProducerModule } from "./infrastructure/queue-producer.module";
import { SettingsModule } from "./infrastructure/settings.module";
import { SqlDbModule } from "./infrastructure/sql-db.module";
import { CategoryModule } from "./modules/category/category.module";
import { ClassificationModule } from "./modules/classification/classification.module";
import { HealthModule } from "./modules/health/health.module";

/**
 * Composition root of the one process: configuration, tuning settings, logs, the database,
 * the queue producer, every HTTP module, the classification worker and the sweeper, and the
 * global API-key guard.
 */
@Module({})
export class AppModule {
  /**
   * Builds the app module. A method, not a static `@Module`, so the environment is read when
   * the app is built and tests can set `process.env` first.
   *
   * @returns The dynamic module the bootstrap starts from.
   */
  public static forRoot(): DynamicModule {
    return {
      module: AppModule,
      imports: [
        AppConfigModule.forRoot(),
        SettingsModule,
        LoggingModule,
        SqlDbModule,
        QueueProducerModule,
        HealthModule,
        CategoryModule,
        ClassificationModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: ApiKeyGuard }],
    };
  }
}
