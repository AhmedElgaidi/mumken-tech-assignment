import { Inject, Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { AppConfigService } from "../../../infrastructure/services/env/app-config.service";
import { QueueNameEnum } from "../../../infrastructure/contracts/enums/queue/queue-name.enum";
import { BaseQueueProcessor } from "../../../infrastructure/processors/base-queue.processor";
import { APP_SETTINGS } from "../../../infrastructure/constants/settings/app-settings.token";
import { AppSettingsInterface } from "../../../infrastructure/contracts/interfaces/settings/app-settings.interface";
import { ClassificationJobNameEnum } from "../contracts/enums/queue/classification-job-name.enum";
import { MAINTENANCE_WORKER } from "../constants/worker/maintenance-worker.constant";
import { SweepReportInterface } from "../contracts/interfaces/worker/sweep-report.interface";
import { SweeperService } from "../services/sweeper.service";

/**
 * Runs the sweeper on its own `maintenance` queue, so it never takes classification
 * concurrency. `upsertJobScheduler` keeps one schedule even when several processes run.
 */
@Injectable()
export class MaintenanceProcessor extends BaseQueueProcessor<unknown, SweepReportInterface> {
  private queue: Queue | null = null;

  public constructor(
    private readonly sweeper: SweeperService,
    config: AppConfigService,
    @Inject(APP_SETTINGS) private readonly settings: AppSettingsInterface,
  ) {
    super(QueueNameEnum.MAINTENANCE, MAINTENANCE_WORKER.CONCURRENCY, config, settings);
  }

  /**
   * Runs one sweeper pass.
   *
   * @returns Counts of what the pass scanned and did.
   */
  public process(): Promise<SweepReportInterface> {
    return this.sweeper.sweep();
  }

  /**
   * Schedules the repeating sweeper job. A scheduling failure is logged, not thrown: the
   * schedule is retried on the next start.
   *
   * @param connection - The worker's Redis connection, reused for the scheduling queue.
   */
  protected override async afterWorkerStarted(connection: Redis): Promise<void> {
    this.queue = new Queue(QueueNameEnum.MAINTENANCE, { connection, prefix: this.settings.queue.prefix });
    try {
      await this.queue.upsertJobScheduler(
        MAINTENANCE_WORKER.SCHEDULER_ID,
        { every: this.settings.sweeper.intervalMs },
        {
          name: ClassificationJobNameEnum.SWEEP,
          opts: { removeOnComplete: true, removeOnFail: MAINTENANCE_WORKER.FAILED_JOB_RETENTION_COUNT },
        },
      );
    } catch (error) {
      this.logger.error({ err: error }, "could not schedule the sweeper; it will be scheduled on the next start");
    }
  }

  /** Closes the scheduling queue before the base class closes the connection. */
  protected override async beforeConnectionClosed(): Promise<void> {
    await this.queue?.close();
  }
}
