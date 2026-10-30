import { Module } from "@nestjs/common";
import { SequelizeModule } from "@nestjs/sequelize";
import { AppConfigService } from "./services/env/app-config.service";
import { CategoryModel } from "./models/category.model";
import { ClassificationAttemptModel } from "./models/classification-attempt.model";
import { ClassificationModel } from "./models/classification.model";
import { ImportModel } from "./models/import.model";
import { CategoryRepository } from "./repositories/category/category.repository";
import { CategorySeederService } from "./services/sql-db/category-seeder.service";
import { SQL_CONNECTION } from "./constants/sql-db/sql-db.constant";

/**
 * One Sequelize connection pool. Models serve simple reads; writes on hot paths use
 * `sequelize.query` with bound parameters (see the repositories). It also seeds the category
 * reference rows on boot, so every process that imports it finds them.
 */
@Module({
  imports: [
    SequelizeModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        dialect: "postgres",
        uri: config.getDatabaseUrl(),
        models: [CategoryModel, ClassificationModel, ClassificationAttemptModel, ImportModel],
        autoLoadModels: false,
        synchronize: false,
        logging: false,
        pool: {
          max: SQL_CONNECTION.POOL_MAX,
          min: SQL_CONNECTION.POOL_MIN,
          acquire: SQL_CONNECTION.POOL_ACQUIRE_MS,
          idle: SQL_CONNECTION.POOL_IDLE_MS,
        },
        retryAttempts: SQL_CONNECTION.RETRY_ATTEMPTS,
        retryDelay: SQL_CONNECTION.RETRY_DELAY_MS,
      }),
    }),
    SequelizeModule.forFeature([CategoryModel, ClassificationModel, ClassificationAttemptModel, ImportModel]),
  ],
  providers: [CategoryRepository, CategorySeederService],
  exports: [SequelizeModule, CategoryRepository],
})
export class SqlDbModule {}
