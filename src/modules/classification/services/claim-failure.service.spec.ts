import { DEFAULT_APP_SETTINGS } from "../../../infrastructure/constants/settings/app-settings.constant";
import { RecordLeaseRepository } from "../../../infrastructure/repositories/classification/record-lease.repository";
import { CLASSIFICATION_FAILURE_MESSAGE } from "../constants/worker/classification-failure-message.constant";
import { RecordStatusEnum } from "../contracts/enums/lifecycle/record-status.enum";
import { ProcessOutcomeEnum } from "../contracts/enums/worker/process-outcome.enum";
import { LeaseHeldException } from "../exceptions/lease-held.exception";
import { ClaimFailureService } from "./claim-failure.service";

describe("ClaimFailureService", () => {
  const maxAttempts = DEFAULT_APP_SETTINGS.classification.maxAttempts;
  const logContext = { recordId: "r1", generation: 0 };
  let readWorkState: jest.Mock;
  let markExhausted: jest.Mock;
  let service: ClaimFailureService;

  beforeEach(() => {
    readWorkState = jest.fn();
    markExhausted = jest.fn().mockResolvedValue(true);
    service = new ClaimFailureService(
      { readWorkState, markExhausted } as unknown as RecordLeaseRepository,
      DEFAULT_APP_SETTINGS,
    );
  });

  it("skips a missing record", async () => {
    readWorkState.mockResolvedValue(null);
    await expect(service.decideAfterFailedClaim("r1", logContext)).resolves.toBe(ProcessOutcomeEnum.SKIPPED);
    expect(markExhausted).not.toHaveBeenCalled();
  });

  it.each([RecordStatusEnum.CLASSIFIED, RecordStatusEnum.NEEDS_REVIEW, RecordStatusEnum.FAILED])(
    "skips a record already %s",
    async (status) => {
      readWorkState.mockResolvedValue({ id: "r1", status, attemptCount: maxAttempts, isLeaseValid: false });
      await expect(service.decideAfterFailedClaim("r1", logContext)).resolves.toBe(ProcessOutcomeEnum.SKIPPED);
      expect(markExhausted).not.toHaveBeenCalled();
    },
  );

  it("marks exhausted when attempts are used up and no live worker holds the lease", async () => {
    readWorkState.mockResolvedValue({
      id: "r1",
      status: RecordStatusEnum.PROCESSING,
      attemptCount: maxAttempts,
      isLeaseValid: false,
    });
    await expect(service.decideAfterFailedClaim("r1", logContext)).resolves.toBe(ProcessOutcomeEnum.EXHAUSTED);
    expect(markExhausted).toHaveBeenCalledWith("r1", maxAttempts, CLASSIFICATION_FAILURE_MESSAGE.ATTEMPTS_EXHAUSTED);
  });

  it("marks a PENDING record with used-up attempts exhausted", async () => {
    readWorkState.mockResolvedValue({
      id: "r1",
      status: RecordStatusEnum.PENDING,
      attemptCount: maxAttempts + 1,
      isLeaseValid: true,
    });
    await expect(service.decideAfterFailedClaim("r1", logContext)).resolves.toBe(ProcessOutcomeEnum.EXHAUSTED);
  });

  it("throws LeaseHeldException when a live worker holds the lease", async () => {
    readWorkState.mockResolvedValue({
      id: "r1",
      status: RecordStatusEnum.PROCESSING,
      attemptCount: maxAttempts,
      isLeaseValid: true,
    });
    await expect(service.decideAfterFailedClaim("r1", logContext)).rejects.toBeInstanceOf(LeaseHeldException);
    expect(markExhausted).not.toHaveBeenCalled();
  });

  it("throws LeaseHeldException when attempts remain", async () => {
    readWorkState.mockResolvedValue({
      id: "r1",
      status: RecordStatusEnum.PENDING,
      attemptCount: 0,
      isLeaseValid: false,
    });
    await expect(service.decideAfterFailedClaim("r1", logContext)).rejects.toBeInstanceOf(LeaseHeldException);
  });
});
