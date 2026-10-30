import { UnrecoverableError } from "bullmq";
import { DEFAULT_APP_SETTINGS } from "../../../infrastructure/constants/settings/app-settings.constant";
import { LeaseWriteResultEnum } from "../../../infrastructure/contracts/enums/sql-db/lease-write-result.enum";
import { ClaimedRecordInterface } from "../../../infrastructure/contracts/interfaces/sql-db/classification/claimed-record.interface";
import { ClassificationResultRepository } from "../../../infrastructure/repositories/classification/classification-result.repository";
import { AttemptOutcomeEnum } from "../contracts/enums/lifecycle/attempt-outcome.enum";
import { FailureKindEnum } from "../contracts/enums/lifecycle/failure-kind.enum";
import { RecordStatusEnum } from "../contracts/enums/lifecycle/record-status.enum";
import { ProcessOutcomeEnum } from "../contracts/enums/worker/process-outcome.enum";
import { PermanentClassificationException } from "../exceptions/permanent-classification.exception";
import { TransientClassificationException } from "../exceptions/transient-classification.exception";
import { AttemptFailureService } from "./attempt-failure.service";

describe("AttemptFailureService", () => {
  const settings = DEFAULT_APP_SETTINGS;
  const maxAttempts = settings.classification.maxAttempts;
  const logContext = { recordId: "r1", generation: 0 };
  const recordAt = (attemptCount: number): ClaimedRecordInterface => ({
    id: "r1",
    title: "t",
    description: "d",
    source: "s",
    recordDate: new Date("2026-10-25"),
    attemptCount,
    retryGeneration: 0,
    leaseToken: "tok",
  });
  let saveFailure: jest.Mock;
  let service: AttemptFailureService;
  const live = (): AbortSignal => new AbortController().signal;

  beforeEach(() => {
    saveFailure = jest.fn().mockResolvedValue(LeaseWriteResultEnum.SAVED);
    service = new AttemptFailureService({ saveFailure } as unknown as ClassificationResultRepository, settings);
  });

  it("retries a transient error while attempts remain", async () => {
    const record = recordAt(1);
    await expect(
      service.record(record, new TransientClassificationException("boom"), live(), 5, logContext),
    ).rejects.toBeInstanceOf(TransientClassificationException);
    expect(saveFailure).toHaveBeenCalledWith(
      record,
      AttemptOutcomeEnum.TRANSIENT_ERROR,
      "TransientClassificationException: boom",
      5,
      { status: RecordStatusEnum.PENDING },
    );
  });

  it("fails transient-exhausted with UnrecoverableError on the last attempt", async () => {
    await expect(
      service.record(recordAt(maxAttempts), new TransientClassificationException("boom"), live(), 5, logContext),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(saveFailure.mock.calls[0][4]).toEqual({
      status: RecordStatusEnum.FAILED,
      failureKind: FailureKindEnum.TRANSIENT_EXHAUSTED,
    });
  });

  it("fails a permanent error at once even with attempts left", async () => {
    await expect(
      service.record(recordAt(1), new PermanentClassificationException("bad"), live(), 5, logContext),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(saveFailure).toHaveBeenCalledWith(
      expect.anything(),
      AttemptOutcomeEnum.PERMANENT_ERROR,
      "PermanentClassificationException: bad",
      5,
      { status: RecordStatusEnum.FAILED, failureKind: FailureKindEnum.PERMANENT },
    );
  });

  it("treats an unknown error as transient and keeps the Name: message text", async () => {
    await expect(service.record(recordAt(1), new TypeError("x"), live(), 5, logContext)).rejects.toBeInstanceOf(
      TransientClassificationException,
    );
    expect(saveFailure.mock.calls[0][1]).toBe(AttemptOutcomeEnum.UNKNOWN_ERROR);
    expect(saveFailure.mock.calls[0][2]).toBe("TypeError: x");
    expect(saveFailure.mock.calls[0][4]).toEqual({ status: RecordStatusEnum.PENDING });
  });

  it("exhausts an unknown error on the last attempt", async () => {
    await expect(service.record(recordAt(maxAttempts), new Error("x"), live(), 5, logContext)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(saveFailure.mock.calls[0][4]).toMatchObject({ failureKind: FailureKindEnum.TRANSIENT_EXHAUSTED });
  });

  it("stringifies a non-Error thrown value", async () => {
    await expect(service.record(recordAt(1), "plain", live(), 5, logContext)).rejects.toThrow("plain");
    expect(saveFailure.mock.calls[0][2]).toBe("plain");
  });

  it("detects a timeout from the aborted signal and retries as transient", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      service.record(recordAt(1), new Error("aborted"), controller.signal, 5, logContext),
    ).rejects.toBeInstanceOf(TransientClassificationException);
    expect(saveFailure.mock.calls[0][1]).toBe(AttemptOutcomeEnum.TRANSIENT_ERROR);
    expect(saveFailure.mock.calls[0][2]).toBe(`timed out after ${settings.classification.classifierTimeoutMs} ms`);
  });

  it("keeps a permanent error permanent even when the signal aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      service.record(recordAt(1), new PermanentClassificationException("bad"), controller.signal, 5, logContext),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(saveFailure.mock.calls[0][1]).toBe(AttemptOutcomeEnum.PERMANENT_ERROR);
  });

  it("returns lost-lease without throwing when the lease was lost", async () => {
    saveFailure.mockResolvedValue(LeaseWriteResultEnum.LOST_LEASE);
    await expect(service.record(recordAt(1), new Error("x"), live(), 5, logContext)).resolves.toBe(
      ProcessOutcomeEnum.LOST_LEASE,
    );
  });
});
