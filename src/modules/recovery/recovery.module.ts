import { Module } from "@nestjs/common";
import { RecoveryRepository } from "../../infrastructure/repositories/record/recovery.repository";
import { SqlDbModule } from "../../infrastructure/sql-db.module";
import { ImportModule } from "../import/import.module";
import { RecordModule } from "../record/record.module";
import { RecoveryService } from "./services/recovery.service";
import { RecoveryController } from "./controllers/recovery.controller";

/** Re-queues FAILED records, one record or a whole import. */
@Module({
  imports: [SqlDbModule, ImportModule, RecordModule],
  controllers: [RecoveryController],
  providers: [RecoveryRepository, RecoveryService],
  exports: [RecoveryService],
})
export class RecoveryModule {}
