import { HttpStatus, Injectable } from "@nestjs/common";
import { IN_FLIGHT_STATUSES } from "../../classification/constants/lifecycle/record-transition.constant";
import { FailureKindEnum } from "../../classification/contracts/enums/lifecycle/failure-kind.enum";
import { RecordStatusEnum } from "../../classification/contracts/enums/lifecycle/record-status.enum";
import { ErrorCodeEnum } from "../../../infrastructure/contracts/enums/http/error-code.enum";
import { ProblemException } from "../../../infrastructure/exceptions/http/problem.exception";
import { ImportRepository } from "../../../infrastructure/repositories/import/import.repository";
import { RecoveryRepository } from "../../../infrastructure/repositories/record/recovery.repository";
import { ClassificationJobService } from "../../classification/services/classification-job.service";
import { RecordService } from "../../record/services/record.service";
import { RecordDetailInterface } from "../../record/contracts/interfaces/record-detail.interface";
import { ImportRetryResultInterface } from "../contracts/interfaces/import-retry-result.interface";
import { RetryDto } from "../contracts/dtos/retry.dto";

/** Recovers FAILED records. Safe to call twice: the second call finds nothing to requeue. */
@Injectable()
export class RecoveryService {
  public constructor(
    private readonly recoveryRepository: RecoveryRepository,
    private readonly importRepository: ImportRepository,
    private readonly recordService: RecordService,
    private readonly classificationJobService: ClassificationJobService,
  ) {}

  /**
   * Re-queues the retryable FAILED records of an import. Re-queued records are PENDING again,
   * so they are not counted as skipped.
   *
   * Steps:
   * 1. Check that the import exists.
   * 2. Re-queue its retryable records.
   * 3. Enqueue the re-queued records for classification.
   * 4. Count what was left alone and return the result.
   *
   * @param importId - The import to recover.
   * @param retry - The retry body: whether to also retry PERMANENT failures.
   * @param requestId - The request id carried into logs and queue jobs.
   * @returns How many records were re-queued and how many were left alone, by reason.
   * @throws ProblemException `NOT_FOUND` when the import does not exist.
   */
  public async retryImport(importId: string, retry: RetryDto, requestId?: string): Promise<ImportRetryResultInterface> {
    // 1. Check that the import exists.
    if (!(await this.importRepository.findById(importId))) {
      throw new ProblemException(HttpStatus.NOT_FOUND, ErrorCodeEnum.NOT_FOUND, `Import ${importId} was not found`);
    }

    // 2. Re-queue its retryable records.
    const requeuedRecords = await this.recoveryRepository.requeueFailedRecords({ importId }, retry.isForced);

    // 3. Enqueue the re-queued records for classification.
    await this.classificationJobService.enqueue(
      requeuedRecords.map((record) => ({ recordId: record.id, generation: record.retryGeneration })),
      requestId,
    );

    // 4. Count what was left alone and return the result.
    const remaining = await this.recoveryRepository.countRemaining(importId);
    return {
      requeued: requeuedRecords.length,
      skipped: { ...remaining, inProgress: remaining.inProgress - requeuedRecords.length },
    };
  }

  /**
   * Re-queues one FAILED record. A record already in flight is returned as it is: it is being
   * recovered, so there is no new work. Any other record is refused with the record attached.
   *
   * Steps:
   * 1. Re-queue the record when it is retryable
   * 2. Return the re-queued record
   * 3. Load the record that was left alone
   * 4. Return a record that is already in flight
   * 5. Refuse the record that cannot be recovered
   *
   * @param recordId - The record to recover.
   * @param retry - The retry body: whether to also retry a PERMANENT failure.
   * @param requestId - The request id carried into logs and queue jobs.
   * @returns The record after the retry.
   * @throws ProblemException `NOT_FOUND`, `PERMANENT_FAILURE` or `NOTHING_TO_RECOVER`.
   */
  public async retryRecord(recordId: string, retry: RetryDto, requestId?: string): Promise<RecordDetailInterface> {
    // 1. Re-queue the record when it is retryable
    const [requeuedRecord] = await this.recoveryRepository.requeueFailedRecords({ recordId }, retry.isForced);

    // 2. Return the re-queued record
    if (requeuedRecord) {
      await this.classificationJobService.enqueue(
        [{ recordId: requeuedRecord.id, generation: requeuedRecord.retryGeneration }],
        requestId,
      );
      return this.recordService.getRecordDetail(recordId);
    }

    // 3. Load the record that was left alone
    const record = await this.recordService.getRecordDetail(recordId);

    // 4. Return a record that is already in flight
    if (IN_FLIGHT_STATUSES.includes(record.classificationStatus)) {
      return record;
    }

    // 5. Refuse the record that cannot be recovered
    throw RecoveryService.createUnrecoverableException(record);
  }

  /**
   * Builds the refusal for a record a retry cannot recover.
   *
   * @param record - The record, attached to the answer.
   * @returns `PERMANENT_FAILURE` for a permanent failure, `NOTHING_TO_RECOVER` for any other record.
   */
  private static createUnrecoverableException(record: RecordDetailInterface): ProblemException {
    if (RecoveryService.isPermanentFailure(record)) {
      return new ProblemException(
        HttpStatus.CONFLICT,
        ErrorCodeEnum.PERMANENT_FAILURE,
        'The record failed permanently; retry with {"isForced": true} or classify it by hand',
        { current: record },
      );
    }
    return new ProblemException(
      HttpStatus.CONFLICT,
      ErrorCodeEnum.NOTHING_TO_RECOVER,
      `The record is ${record.classificationStatus}; there is nothing to recover`,
      { current: record },
    );
  }

  /**
   * Tells whether the record is FAILED with a PERMANENT failure.
   *
   * @param record - The record to look at.
   * @returns `true` for a permanent failure.
   */
  private static isPermanentFailure(record: RecordDetailInterface): boolean {
    return record.classificationStatus === RecordStatusEnum.FAILED && record.failureKind === FailureKindEnum.PERMANENT;
  }
}
