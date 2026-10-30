import { Global, Module } from "@nestjs/common";
import { SqlDbModule } from "../../infrastructure/sql-db.module";
import { CategoryModule } from "../category/category.module";
import { ClassificationJobService } from "./services/classification-job.service";

/**
 * Classification: putting jobs on the queue (global, so imports and recovery can enqueue), the
 * classification consumer and its collaborators, and the sweeper with its schedule.
 */
@Global()
@Module({
  imports: [SqlDbModule, CategoryModule],
  providers: [
    ClassificationJobService,
  ],
  exports: [
    ClassificationJobService,
  ],
})
export class ClassificationModule {}
