import { Module } from "@nestjs/common";
import { ImportRepository } from "../../infrastructure/repositories/import/import.repository";
import { SqlDbModule } from "../../infrastructure/sql-db.module";
import { ImportService } from "./services/import.service";
import { ImportIdempotencyService } from "./services/import-idempotency.service";
import { ImportReaderService } from "./services/import-reader.service";
import { ImportStorageService } from "./services/import-storage.service";
import { ImportController } from "./controllers/import.controller";

/** Accepts import batches and exposes the stored imports for reading and recovery. */
@Module({
  imports: [SqlDbModule],
  controllers: [ImportController],
  providers: [ImportRepository, ImportReaderService, ImportIdempotencyService, ImportStorageService, ImportService],
  exports: [ImportRepository, ImportService],
})
export class ImportModule {}
