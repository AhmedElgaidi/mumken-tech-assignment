import { Module } from "@nestjs/common";
import { RecordRepository } from "../../infrastructure/repositories/record/record.repository";
import { SqlDbModule } from "../../infrastructure/sql-db.module";
import { CategoryModule } from "../category/category.module";
import { RecordFilterService } from "./services/record-filter.service";
import { RecordService } from "./services/record.service";
import { RecordController } from "./controllers/record.controller";

/** Reads records and their classification history; exported for review and recovery. */
@Module({
  imports: [SqlDbModule, CategoryModule],
  controllers: [RecordController],
  providers: [RecordRepository, RecordFilterService, RecordService],
  exports: [RecordRepository, RecordService],
})
export class RecordModule {}
