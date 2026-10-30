import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { Job } from "bullmq";
import { AppConfigService } from "../../../infrastructure/services/env/app-config.service";
import { BaseQueueProcessor } from "../../../infrastructure/processors/base-queue.processor";
import { QueueNameEnum } from "../../../infrastructure/contracts/enums/queue/queue-name.enum";
import { APP_SETTINGS } from "../../../infrastructure/constants/settings/app-settings.token";
import { AppSettingsInterface } from "../../../infrastructure/contracts/interfaces/settings/app-settings.interface";
import { LeaseWriteResultEnum } from "../../../infrastructure/contracts/enums/sql-db/lease-write-result.enum";
import { ClaimedRecordInterface } from "../../../infrastructure/contracts/interfaces/sql-db/classification/claimed-record.interface";
import { RecordLeaseRepository } from "../../../infrastructure/repositories/classification/record-lease.repository";
import { ClassificationResultRepository } from "../../../infrastructure/repositories/classification/classification-result.repository";
import { TimeoutUtil } from "../../../infrastructure/utils/timeout/timeout.util";
import { ClassificationJobDataInterface } from "../contracts/interfaces/queue/classification-job.interface";
import { CLASSIFIER } from "../constants/worker/classifier.token";
import { ClassificationLogEventEnum } from "../contracts/enums/worker/classification-log-event.enum";
import { ProcessOutcomeEnum } from "../contracts/enums/worker/process-outcome.enum";
import { ClassificationLogContextInterface } from "../contracts/interfaces/worker/classification-log-context.interface";
import { ClassifierInterface, ClassifierResultInterface } from "../contracts/interfaces/worker/classifier.interface";
import { AttemptFailureService } from "../services/attempt-failure.service";
import { AutomaticResultService } from "../services/automatic-result.service";
import { ClaimFailureService } from "../services/claim-failure.service";

/**
 * Classifies one record: claim with a lease → call the classifier with a timeout → save the
 * result in one transaction. The database `attemptCount` is the only attempt counter. It
 * consumes the classification queue through `BaseQueueProcessor`.
 */
@Injectable()
export class ClassificationProcessor extends BaseQueueProcessor<ClassificationJobDataInterface, ProcessOutcomeEnum> {
  public constructor(
    private readonly recordRepository: RecordLeaseRepository,
    private readonly resultRepository: ClassificationResultRepository,
    private readonly claimFailureService: ClaimFailureService,
    private readonly automaticResultService: AutomaticResultService,
    private readonly attemptFailureService: AttemptFailureService,
    config: AppConfigService,
    @Inject(APP_SETTINGS) private readonly settings: AppSettingsInterface,
    @Inject(CLASSIFIER) private readonly classifier: ClassifierInterface,
  ) {
    super(QueueNameEnum.CLASSIFICATION, settings.classification.concurrency, config, settings);
  }

  /**
   * Runs one job of the classification queue.
   *
   * @param job - The BullMQ job; its data names the record and the retry generation.
   * @returns What happened to the record.
   */
  public process(job: Job<ClassificationJobDataInterface>): Promise<ProcessOutcomeEnum> {
    return this.handle(job.data);
  }

  /**
   * Handles one job. Resolves when the record reached a final state (or needs no work);
   * throws a retryable error to make BullMQ retry with backoff, or `UnrecoverableError`.
   *
   * Steps:
   * 1. Claim the record with a lease, or resolve why it could not be claimed.
   * 2. Call the classifier under a timeout signal.
   * 3. Save the validated result, dropping it when the lease was lost.
   * 4. Record the failure when the call or the save threw.
   *
   * @param jobData - Payload of the BullMQ job: record id, retry generation, request id.
   * @returns What happened to the record.
   * @throws TransientClassificationException when the attempt failed and attempts remain.
   * @throws LeaseHeldException when another worker holds a valid lease on the record.
   * @throws UnrecoverableError when the failure is final.
   */
  public async handle(jobData: ClassificationJobDataInterface): Promise<ProcessOutcomeEnum> {
    const logContext: ClassificationLogContextInterface = {
      recordId: jobData.recordId,
      generation: jobData.generation,
      requestId: jobData.requestId,
    };
    const { maxAttempts, leaseMs, classifierTimeoutMs } = this.settings.classification;

    // 1. Claim the record with a lease, or resolve why it could not be claimed.
    const record = await this.recordRepository.claim(jobData.recordId, randomUUID(), leaseMs, maxAttempts);
    if (!record) {
      return this.claimFailureService.decideAfterFailedClaim(jobData.recordId, logContext);
    }
    this.logger.log(
      { ...logContext, attemptNo: record.attemptCount, event: ClassificationLogEventEnum.STARTED },
      "classification started",
    );
    const startedAt = Date.now();
    const signal = AbortSignal.timeout(classifierTimeoutMs);
    try {
      // 2. Call the classifier under a timeout signal.
      const classifierAnswer = await this.callClassifier(record, signal);

      // 3. Save the validated result, dropping it when the lease was lost.
      return await this.saveAnswer(record, classifierAnswer, Date.now() - startedAt, logContext);
    } catch (error) {
      // 4. Record the failure when the call or the save threw.
      return this.attemptFailureService.record(record, error, signal, Date.now() - startedAt, logContext);
    }
  }

  /**
   * Calls the classifier and gives up when the signal aborts first.
   *
   * @param record - The claimed record to classify.
   * @param signal - Aborts the call when the timeout fires.
   * @returns What the classifier answered.
   */
  private callClassifier(record: ClaimedRecordInterface, signal: AbortSignal): Promise<ClassifierResultInterface> {
    const classifierCall = this.classifier.classify(
      {
        title: record.title,
        description: record.description,
        source: record.source,
        date: record.recordDate.toISOString(),
        attemptNo: record.attemptCount,
      },
      signal,
    );
    return TimeoutUtil.raceWithSignal(classifierCall, signal);
  }

  /**
   * Validates the classifier's answer and stores it under the lease.
   *
   * Steps:
   * 1. Validate the answer and build the result to store.
   * 2. Save the result and drop it when the lease was lost.
   * 3. Log the success and name the outcome.
   *
   * @param record - The claimed record.
   * @param classifierAnswer - What the classifier returned.
   * @param durationMs - How long the attempt ran so far.
   * @param logContext - Fields added to every log line of this job.
   * @returns `classified`, `needs-review` or `lost-lease`.
   * @throws PermanentClassificationException when the answer is invalid.
   */
  private async saveAnswer(
    record: ClaimedRecordInterface,
    classifierAnswer: ClassifierResultInterface,
    durationMs: number,
    logContext: ClassificationLogContextInterface,
  ): Promise<ProcessOutcomeEnum> {
    // 1. Validate the answer and build the result to store.
    const automaticResult = await this.automaticResultService.build(classifierAnswer);

    // 2. Save the result and drop it when the lease was lost.
    const saveResult = await this.resultRepository.saveSuccess(record, automaticResult, durationMs);
    if (saveResult === LeaseWriteResultEnum.LOST_LEASE) {
      this.logger.warn(
        { ...logContext, event: ClassificationLogEventEnum.LOST_LEASE },
        "lease lost before saving; result dropped",
      );
      return ProcessOutcomeEnum.LOST_LEASE;
    }

    // 3. Log the success and name the outcome.
    this.logger.log(
      {
        ...logContext,
        event: ClassificationLogEventEnum.SUCCEEDED,
        category: automaticResult.categoryCode,
        confidence: automaticResult.confidence,
      },
      "classification succeeded",
    );
    return automaticResult.isReviewNeeded ? ProcessOutcomeEnum.NEEDS_REVIEW : ProcessOutcomeEnum.CLASSIFIED;
  }
}
