import { Module } from "@nestjs/common";
import { ReviewRepository } from "../../infrastructure/repositories/classification/review.repository";
import { SqlDbModule } from "../../infrastructure/sql-db.module";
import { CategoryModule } from "../category/category.module";
import { RecordModule } from "../record/record.module";
import { ManualClassificationService } from "./services/manual-classification.service";
import { ReviewApprovalService } from "./services/review-approval.service";
import { ReviewCorrectionService } from "./services/review-correction.service";
import { ReviewRecordService } from "./services/review-record.service";
import { ReviewService } from "./services/review.service";
import { ReviewController } from "./controllers/review.controller";

/** Human review of classifications: approve or correct a record. */
@Module({
  imports: [SqlDbModule, CategoryModule, RecordModule],
  controllers: [ReviewController],
  providers: [
    ReviewRepository,
    ReviewRecordService,
    ManualClassificationService,
    ReviewApprovalService,
    ReviewCorrectionService,
    ReviewService,
  ],
  exports: [ReviewService],
})
export class ReviewModule {}
