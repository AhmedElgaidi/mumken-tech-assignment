import { Global, Module } from "@nestjs/common";
import { ClassificationResultRepository } from "../../infrastructure/repositories/classification/classification-result.repository";
import { RecordLeaseRepository } from "../../infrastructure/repositories/classification/record-lease.repository";
import { SqlDbModule } from "../../infrastructure/sql-db.module";
import { CategoryModule } from "../category/category.module";
import { CLASSIFIER } from "./constants/worker/classifier.token";
import { ClassifierFactory } from "./factories/classifier.factory";
import { ClassificationProcessor } from "./processors/classification.processor";
import { MaintenanceProcessor } from "./processors/maintenance.processor";
import { AttemptFailureService } from "./services/attempt-failure.service";
import { AutomaticResultService } from "./services/automatic-result.service";
import { ClaimFailureService } from "./services/claim-failure.service";
import { ClassificationJobService } from "./services/classification-job.service";
import { SweeperService } from "./services/sweeper.service";

/**
 * Classification: putting jobs on the queue (global, so imports and recovery can enqueue), the
 * classification consumer and its collaborators, and the sweeper with its schedule.
 */
@Global()
@Module({
  imports: [SqlDbModule, CategoryModule],
  providers: [
    { provide: CLASSIFIER, useFactory: () => ClassifierFactory.create() },
    ClassificationJobService,
    RecordLeaseRepository,
    ClassificationResultRepository,
    ClaimFailureService,
    AutomaticResultService,
    AttemptFailureService,
    ClassificationProcessor,
    SweeperService,
    MaintenanceProcessor,
  ],
  exports: [
    ClassificationJobService,
    ClassificationProcessor,
    SweeperService,
    RecordLeaseRepository,
    ClassificationResultRepository,
  ],
})
export class ClassificationModule {}
