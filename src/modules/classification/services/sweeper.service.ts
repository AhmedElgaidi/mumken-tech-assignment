import { Inject, Injectable, Logger } from "@nestjs/common";
import { RecordStatusEnum } from "../contracts/enums/lifecycle/record-status.enum";
import {
  StuckRecordCursorInterface,
  StuckRecordInterface,
} from "../../../infrastructure/contracts/interfaces/sql-db/classification/claimed-record.interface";
import { RecordLeaseRepository } from "../../../infrastructure/repositories/classification/record-lease.repository";
import { EnsureJobResultEnum } from "../contracts/enums/queue/ensure-job-result.enum";
import { ClassificationJobService } from "./classification-job.service";
import { CLASSIFICATION_FAILURE_MESSAGE } from "../constants/worker/classification-failure-message.constant";
import { ClassificationLogEventEnum } from "../contracts/enums/worker/classification-log-event.enum";
import { SweepReportInterface } from "../contracts/interfaces/worker/sweep-report.interface";
import { SweepCounterType } from "../contracts/types/sweep-counter.type";
import { APP_SETTINGS } from "../../../infrastructure/constants/settings/app-settings.token";
import { AppSettingsInterface } from "../../../infrastructure/contracts/interfaces/settings/app-settings.interface";

/**
 * Rebuilds the queue from the database: finds PENDING records nobody is working on and
 * PROCESSING records whose lease expired, and makes sure each has a live job. It never touches
 * CLASSIFIED, NEEDS_REVIEW or FAILED (recovering failures is the client's decision).
 */
@Injectable()
export class SweeperService {
  private readonly logger = new Logger(SweeperService.name);

  public constructor(
    private readonly recordRepository: RecordLeaseRepository,
    private readonly jobService: ClassificationJobService,
    @Inject(APP_SETTINGS) private readonly settings: AppSettingsInterface,
  ) {}

  /**
   * Runs one full pass over every candidate, page by page. No row locks are taken: re-adding
   * a job is idempotent, so a concurrent worker is harmless.
   *
   * Steps:
   * 1. Read the next page of stuck records.
   * 2. Recover each record: fail the exhausted ones, queue the rest.
   * 3. Stop after the last page.
   * 4. Log the pass when it recovered anything.
   *
   * @returns Counts of what the pass scanned and did.
   */
  public async sweep(): Promise<SweepReportInterface> {
    const sweepReport: SweepReportInterface = {
      scanned: 0,
      requeued: 0,
      alreadyQueued: 0,
      exhausted: 0,
      skippedActive: 0,
    };
    const pageSize = this.settings.sweeper.batchSize;
    const maxAttempts = this.settings.classification.maxAttempts;
    let afterCursor: StuckRecordCursorInterface | null = null;

    for (;;) {
      // 1. Read the next page of stuck records.
      const page = await this.recordRepository.findStuckRecords(
        this.settings.sweeper.pendingGraceMs,
        pageSize,
        afterCursor,
      );

      // 2. Recover each record: fail the exhausted ones, queue the rest.
      for (const record of page) {
        sweepReport.scanned += 1;
        const recoveredCounter = await this.recoverRecord(record, maxAttempts);
        if (recoveredCounter) {
          sweepReport[recoveredCounter] += 1;
        }
      }

      // 3. Stop after the last page.
      const lastRecord = page.at(-1);
      if (!lastRecord || page.length < pageSize) {
        break;
      }
      afterCursor = { updatedAtText: lastRecord.updatedAtText, id: lastRecord.id };
    }

    // 4. Log the pass when it recovered anything.
    if (sweepReport.requeued > 0 || sweepReport.exhausted > 0) {
      this.logger.log(
        { ...sweepReport, event: ClassificationLogEventEnum.SWEEPER_REQUEUED },
        "sweeper recovered records",
      );
    }
    return sweepReport;
  }

  /**
   * Recovers one stuck record and names the report counter that records what was done.
   *
   * Steps:
   * 1. Mark the record failed when it used every attempt while PROCESSING.
   * 2. Otherwise make sure it has a live job and name the matching counter.
   *
   * @param record - A stuck record found by the sweeper.
   * @param maxAttempts - Attempt limit from the settings.
   * @returns The report counter to increase, or `null` when nothing changed.
   */
  private async recoverRecord(record: StuckRecordInterface, maxAttempts: number): Promise<SweepCounterType | null> {
    // 1. Mark the record failed when it used every attempt while PROCESSING.
    if (record.status === RecordStatusEnum.PROCESSING && record.attemptCount >= maxAttempts) {
      const isMarkedExhausted = await this.recordRepository.markExhausted(
        record.id,
        maxAttempts,
        CLASSIFICATION_FAILURE_MESSAGE.ATTEMPTS_EXHAUSTED,
      );
      return isMarkedExhausted ? "exhausted" : null;
    }

    // 2. Otherwise make sure it has a live job and name the matching counter.
    const ensureJobResult = await this.jobService.ensureJob({
      recordId: record.id,
      generation: record.retryGeneration,
    });
    if (ensureJobResult === EnsureJobResultEnum.EXISTS) {
      return "alreadyQueued";
    }
    return ensureJobResult === EnsureJobResultEnum.SKIPPED_ACTIVE ? "skippedActive" : "requeued";
  }
}
