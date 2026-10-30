import { Inject, Injectable, Logger } from "@nestjs/common";
import { JobsOptions } from "bullmq";
import { QueueNameEnum } from "../../../infrastructure/contracts/enums/queue/queue-name.enum";
import { QueueProducerService } from "../../../infrastructure/services/queue/queue-producer.service";
import { APP_SETTINGS } from "../../../infrastructure/constants/settings/app-settings.token";
import { AppSettingsInterface } from "../../../infrastructure/contracts/interfaces/settings/app-settings.interface";
import { CLASSIFICATION_JOB_OPTION } from "../constants/queue/classification-job.constant";
import { ClassificationJobNameEnum } from "../contracts/enums/queue/classification-job-name.enum";
import { ClassificationJobStateEnum } from "../contracts/enums/queue/classification-job-state.enum";
import { EnsureJobResultEnum } from "../contracts/enums/queue/ensure-job-result.enum";
import {
  ClassificationJobDataInterface,
  ClassificationTargetInterface,
} from "../contracts/interfaces/queue/classification-job.interface";
import { ClassificationJobUtil } from "../utils/classification-job.util";

/**
 * Classification meaning of a job: its id, payload, retry and backoff options. The transport
 * is the generic queue producer; the rest of the app only calls `enqueue`.
 */
@Injectable()
export class ClassificationJobService {
  private static readonly ACTIVE_JOB_STATES: ReadonlySet<string> = new Set([
    ClassificationJobStateEnum.WAITING,
    ClassificationJobStateEnum.ACTIVE,
    ClassificationJobStateEnum.DELAYED,
    ClassificationJobStateEnum.PRIORITIZED,
    ClassificationJobStateEnum.WAITING_CHILDREN,
  ]);

  private readonly logger = new Logger(ClassificationJobService.name);

  public constructor(
    private readonly producer: QueueProducerService,
    @Inject(APP_SETTINGS) private readonly settings: AppSettingsInterface,
  ) {}

  /**
   * Builds the BullMQ options of one classification job. The database `attemptCount` is the
   * real attempt limit; BullMQ's is a safety net above it.
   *
   * @param recordId - Record the job classifies.
   * @param generation - Retry generation of the record.
   * @returns The options to pass to `add` / `addBulk`.
   */
  public getJobOptions(recordId: string, generation: number): JobsOptions {
    return {
      jobId: ClassificationJobUtil.getJobId(recordId, generation),
      attempts: this.settings.classification.maxAttempts + CLASSIFICATION_JOB_OPTION.ATTEMPTS_SAFETY_MARGIN,
      backoff: {
        type: CLASSIFICATION_JOB_OPTION.BACKOFF_TYPE,
        delay: this.settings.classification.backoffMs,
      },
      removeOnComplete: true,
      removeOnFail: { age: CLASSIFICATION_JOB_OPTION.FAILED_RETENTION_SECONDS },
    };
  }

  /**
   * Enqueues one job per record. Never throws: when Redis is unavailable it logs a warning and
   * returns `false`; the records stay PENDING and the sweeper enqueues them once Redis is back.
   *
   * @param targets - Records to enqueue, each with its retry generation.
   * @param requestId - Request id of the calling HTTP request, for log correlation.
   * @returns `true` when every job was added (or there was nothing to add), `false` on failure.
   */
  public async enqueue(targets: ClassificationTargetInterface[], requestId?: string): Promise<boolean> {
    if (targets.length === 0) {
      return true;
    }
    try {
      await this.producer.addJobs(
        QueueNameEnum.CLASSIFICATION,
        targets.map((target) => ({
          name: ClassificationJobNameEnum.CLASSIFY,
          data: { recordId: target.recordId, generation: target.generation, requestId },
          opts: this.getJobOptions(target.recordId, target.generation),
        })),
      );
      return true;
    } catch (error) {
      this.logger.warn(
        { err: error, count: targets.length, requestId },
        "enqueue failed; records stay PENDING for the sweeper",
      );
      return false;
    }
  }

  /**
   * Makes sure a live job exists for the record (used by the sweeper). A plain `add()` with an
   * existing id is silently ignored by BullMQ, so a finished job is removed before re-adding.
   * When the removal fails the job turned active in between, so a worker already has it.
   *
   * Steps:
   * 1. Look up the job stored for the record.
   * 2. Skip or remove the stored job when one exists.
   * 3. Add the job and return what was done.
   *
   * @param target - Record and retry generation to make sure a job exists for.
   * @returns What was done: nothing, a plain add, a remove-then-add, or a skip.
   */
  public async ensureJob(target: ClassificationTargetInterface): Promise<EnsureJobResultEnum> {
    // 1. Look up the job stored for the record.
    const jobId = ClassificationJobUtil.getJobId(target.recordId, target.generation);
    const existingJob = await this.producer.getJob<ClassificationJobDataInterface>(QueueNameEnum.CLASSIFICATION, jobId);

    // 2. Skip or remove the stored job when one exists.
    let ensureJobResult = EnsureJobResultEnum.ADDED;
    if (existingJob) {
      const jobState = await existingJob.getState();
      if (ClassificationJobService.ACTIVE_JOB_STATES.has(jobState)) {
        return EnsureJobResultEnum.EXISTS;
      }
      try {
        await existingJob.remove();
      } catch {
        return EnsureJobResultEnum.SKIPPED_ACTIVE;
      }
      ensureJobResult = EnsureJobResultEnum.RE_ADDED;
    }

    // 3. Add the job and return what was done.
    await this.producer.addJob(
      QueueNameEnum.CLASSIFICATION,
      ClassificationJobNameEnum.CLASSIFY,
      { recordId: target.recordId, generation: target.generation },
      this.getJobOptions(target.recordId, target.generation),
    );
    return ensureJobResult;
  }
}
