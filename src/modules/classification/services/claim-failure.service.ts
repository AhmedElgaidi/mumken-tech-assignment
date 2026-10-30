import { Inject, Injectable, Logger } from "@nestjs/common";
import { RecordLeaseRepository } from "../../../infrastructure/repositories/classification/record-lease.repository";
import { APP_SETTINGS } from "../../../infrastructure/constants/settings/app-settings.token";
import { AppSettingsInterface } from "../../../infrastructure/contracts/interfaces/settings/app-settings.interface";
import { TERMINAL_FOR_WORKER } from "../constants/lifecycle/record-transition.constant";
import { RecordStatusEnum } from "../contracts/enums/lifecycle/record-status.enum";
import { CLASSIFICATION_FAILURE_MESSAGE } from "../constants/worker/classification-failure-message.constant";
import { ClassificationLogEventEnum } from "../contracts/enums/worker/classification-log-event.enum";
import { ProcessOutcomeEnum } from "../contracts/enums/worker/process-outcome.enum";
import { ClassificationLogContextInterface } from "../contracts/interfaces/worker/classification-log-context.interface";
import { LeaseHeldException } from "../exceptions/lease-held.exception";

/**
 * Explains why a worker could not take the lease on a record: nothing to do, attempts used
 * up, or a live worker still holds it.
 */
@Injectable()
export class ClaimFailureService {
  private readonly logger = new Logger(ClaimFailureService.name);

  public constructor(
    private readonly recordRepository: RecordLeaseRepository,
    @Inject(APP_SETTINGS) private readonly settings: AppSettingsInterface,
  ) {}

  /**
   * Settles a job whose record could not be claimed. The last case throws so BullMQ retries
   * the job later.
   *
   * Steps:
   * 1. Read the record's work state and skip it when it is missing or already final.
   * 2. Mark the record failed when every attempt is used and no live worker holds it.
   * 3. Throw `LeaseHeldException` so the job is retried later.
   *
   * @param recordId - Record whose claim failed.
   * @param logContext - Fields added to every log line of this job.
   * @returns `skipped` or `exhausted`.
   * @throws LeaseHeldException when another worker is still working on the record.
   */
  public async decideAfterFailedClaim(
    recordId: string,
    logContext: ClassificationLogContextInterface,
  ): Promise<ProcessOutcomeEnum> {
    // 1. Read the record's work state and skip it when it is missing or already final.
    const workState = await this.recordRepository.readWorkState(recordId);
    if (!workState || TERMINAL_FOR_WORKER.includes(workState.status)) {
      this.logger.log(
        { ...logContext, status: workState?.status, event: ClassificationLogEventEnum.SKIPPED },
        "nothing to do",
      );
      return ProcessOutcomeEnum.SKIPPED;
    }

    // 2. Mark the record failed when every attempt is used and no live worker holds it.
    const { maxAttempts } = this.settings.classification;
    const isHeldByLiveWorker = workState.status === RecordStatusEnum.PROCESSING && workState.isLeaseValid;
    if (workState.attemptCount >= maxAttempts && !isHeldByLiveWorker) {
      await this.recordRepository.markExhausted(
        recordId,
        maxAttempts,
        CLASSIFICATION_FAILURE_MESSAGE.ATTEMPTS_EXHAUSTED,
      );
      this.logger.warn(
        { ...logContext, event: ClassificationLogEventEnum.FAILED, reason: ProcessOutcomeEnum.EXHAUSTED },
        "attempts exhausted",
      );
      return ProcessOutcomeEnum.EXHAUSTED;
    }

    // 3. Throw `LeaseHeldException` so the job is retried later.
    throw new LeaseHeldException(`record ${recordId} is being processed by another worker`);
  }
}
