import { Inject, Injectable, Logger } from "@nestjs/common";
import { UnrecoverableError } from "bullmq";
import { ClaimedRecordInterface } from "../../../infrastructure/contracts/interfaces/sql-db/classification/claimed-record.interface";
import { LeaseWriteResultEnum } from "../../../infrastructure/contracts/enums/sql-db/lease-write-result.enum";
import { ClassificationResultRepository } from "../../../infrastructure/repositories/classification/classification-result.repository";
import { APP_SETTINGS } from "../../../infrastructure/constants/settings/app-settings.token";
import { AppSettingsInterface } from "../../../infrastructure/contracts/interfaces/settings/app-settings.interface";
import { AttemptOutcomeEnum } from "../contracts/enums/lifecycle/attempt-outcome.enum";
import { FailureKindEnum } from "../contracts/enums/lifecycle/failure-kind.enum";
import { RecordStatusEnum } from "../contracts/enums/lifecycle/record-status.enum";
import { ClassificationLogEventEnum } from "../contracts/enums/worker/classification-log-event.enum";
import { ProcessOutcomeEnum } from "../contracts/enums/worker/process-outcome.enum";
import { ClassificationLogContextInterface } from "../contracts/interfaces/worker/classification-log-context.interface";
import { PermanentClassificationException } from "../exceptions/permanent-classification.exception";
import { TransientClassificationException } from "../exceptions/transient-classification.exception";

/** Stores a failed attempt and tells BullMQ whether to retry the job. */
@Injectable()
export class AttemptFailureService {
  private readonly logger = new Logger(AttemptFailureService.name);

  public constructor(
    private readonly resultRepository: ClassificationResultRepository,
    @Inject(APP_SETTINGS) private readonly settings: AppSettingsInterface,
  ) {}

  /**
   * Stores a failed attempt and always throws: a retryable error while attempts remain,
   * `UnrecoverableError` otherwise. A timeout counts as transient. When the lease was lost
   * meanwhile it only reports `lost-lease`.
   *
   * Steps:
   * 1. Classify the error as permanent, transient or unknown.
   * 2. Decide whether the record goes back to PENDING or to FAILED.
   * 3. Save the failure under the lease.
   * 4. Throw the error that tells BullMQ to retry or to stop.
   *
   * @param record - The claimed record the attempt ran on.
   * @param error - What the attempt threw.
   * @param signal - The timeout signal of the attempt.
   * @param durationMs - How long the attempt ran, in milliseconds.
   * @param logContext - Fields added to every log line of this job.
   * @returns `lost-lease` when another worker owns the record now.
   * @throws TransientClassificationException when the attempt will be retried.
   * @throws UnrecoverableError when the failure is final.
   */
  public async record(
    record: ClaimedRecordInterface,
    error: unknown,
    signal: AbortSignal,
    durationMs: number,
    logContext: ClassificationLogContextInterface,
  ): Promise<ProcessOutcomeEnum> {
    // 1. Classify the error as permanent, transient or unknown.
    const hasTimedOut = signal.aborted && !(error instanceof PermanentClassificationException);
    const attemptOutcome = this.resolveAttemptOutcome(error, hasTimedOut);
    const failureMessage = this.describeFailure(error, hasTimedOut);

    // 2. Decide whether the record goes back to PENDING or to FAILED.
    const isRetryable = attemptOutcome !== AttemptOutcomeEnum.PERMANENT_ERROR;
    const shouldRetry = isRetryable && record.attemptCount < this.settings.classification.maxAttempts;

    // 3. Save the failure under the lease.
    const nextState = shouldRetry
      ? { status: RecordStatusEnum.PENDING as const }
      : {
          status: RecordStatusEnum.FAILED as const,
          failureKind: isRetryable ? FailureKindEnum.TRANSIENT_EXHAUSTED : FailureKindEnum.PERMANENT,
        };
    const saveResult = await this.resultRepository.saveFailure(
      record,
      attemptOutcome,
      failureMessage,
      durationMs,
      nextState,
    );
    if (saveResult === LeaseWriteResultEnum.LOST_LEASE) {
      this.logger.warn(
        { ...logContext, event: ClassificationLogEventEnum.LOST_LEASE },
        "lease lost while recording a failure",
      );
      return ProcessOutcomeEnum.LOST_LEASE;
    }

    // 4. Throw the error that tells BullMQ to retry or to stop.
    return this.throwRetryOrStop(shouldRetry, record.attemptCount, failureMessage, logContext);
  }

  /**
   * Maps what the attempt threw to the outcome stored on the attempt row.
   *
   * Steps:
   * 1. Return permanent for a permanent error.
   * 2. Return transient for a transient error or a timeout.
   * 3. Return unknown for anything else.
   *
   * @param error - What the attempt threw.
   * @param hasTimedOut - Whether the timeout signal fired.
   * @returns Permanent for a permanent error, transient for a transient error or a timeout, else unknown.
   */
  private resolveAttemptOutcome(error: unknown, hasTimedOut: boolean): AttemptOutcomeEnum {
    // 1. Return permanent for a permanent error.
    if (error instanceof PermanentClassificationException) {
      return AttemptOutcomeEnum.PERMANENT_ERROR;
    }

    // 2. Return transient for a transient error or a timeout.
    if (error instanceof TransientClassificationException || hasTimedOut) {
      return AttemptOutcomeEnum.TRANSIENT_ERROR;
    }

    // 3. Return unknown for anything else.
    return AttemptOutcomeEnum.UNKNOWN_ERROR;
  }

  /**
   * Builds the message stored with the failed attempt.
   *
   * @param error - What the attempt threw.
   * @param hasTimedOut - Whether the timeout signal fired.
   * @returns The timeout text, `Name: message` for an `Error`, or the thrown value as text.
   */
  private describeFailure(error: unknown, hasTimedOut: boolean): string {
    if (hasTimedOut) {
      return `timed out after ${this.settings.classification.classifierTimeoutMs} ms`;
    }
    return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }

  /**
   * Throws the error that makes BullMQ retry the job or give up on it.
   *
   * Steps:
   * 1. Build the log fields shared by both outcomes.
   * 2. Log a warning and throw a retryable error when attempts remain.
   * 3. Log the final failure and throw `UnrecoverableError`.
   *
   * @param shouldRetry - Whether attempts remain for a retryable failure.
   * @param attemptNumber - Which attempt just failed.
   * @param failureMessage - The stored failure message.
   * @param logContext - Fields added to the log line.
   * @returns Never returns.
   * @throws TransientClassificationException when the attempt will be retried.
   * @throws UnrecoverableError when the failure is final.
   */
  private throwRetryOrStop(
    shouldRetry: boolean,
    attemptNumber: number,
    failureMessage: string,
    logContext: ClassificationLogContextInterface,
  ): never {
    // 1. Build the log fields shared by both outcomes.
    const logFields = { ...logContext, attemptNo: attemptNumber, error: failureMessage };

    // 2. Log a warning and throw a retryable error when attempts remain.
    if (shouldRetry) {
      this.logger.warn({ ...logFields, event: ClassificationLogEventEnum.RETRYING }, "classification will retry");
      throw new TransientClassificationException(failureMessage);
    }

    // 3. Log the final failure and throw `UnrecoverableError`.
    this.logger.error({ ...logFields, event: ClassificationLogEventEnum.FAILED }, "classification failed");
    throw new UnrecoverableError(failureMessage);
  }
}
