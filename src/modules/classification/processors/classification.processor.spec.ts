import { Job } from "bullmq";
import { DEFAULT_APP_SETTINGS } from "../../../infrastructure/constants/settings/app-settings.constant";
import { LeaseWriteResultEnum } from "../../../infrastructure/contracts/enums/sql-db/lease-write-result.enum";
import {
  AutomaticResultInterface,
  ClaimedRecordInterface,
} from "../../../infrastructure/contracts/interfaces/sql-db/classification/claimed-record.interface";
import { ClassificationResultRepository } from "../../../infrastructure/repositories/classification/classification-result.repository";
import { RecordLeaseRepository } from "../../../infrastructure/repositories/classification/record-lease.repository";
import { AppConfigService } from "../../../infrastructure/services/env/app-config.service";
import { ClassificationJobDataInterface } from "../contracts/interfaces/queue/classification-job.interface";
import { ClassifierInterface } from "../contracts/interfaces/worker/classifier.interface";
import { ProcessOutcomeEnum } from "../contracts/enums/worker/process-outcome.enum";
import { LeaseHeldException } from "../exceptions/lease-held.exception";
import { PermanentClassificationException } from "../exceptions/permanent-classification.exception";
import { AttemptFailureService } from "../services/attempt-failure.service";
import { AutomaticResultService } from "../services/automatic-result.service";
import { ClaimFailureService } from "../services/claim-failure.service";
import { ClassificationProcessor } from "./classification.processor";

describe("ClassificationProcessor", () => {
  const settings = DEFAULT_APP_SETTINGS;
  const jobData: ClassificationJobDataInterface = { recordId: "r1", generation: 2, requestId: "req" };
  const record: ClaimedRecordInterface = {
    id: "r1",
    title: "Title",
    description: "Desc",
    source: "src",
    recordDate: new Date("2026-10-25T00:00:00.000Z"),
    attemptCount: 1,
    retryGeneration: 2,
    leaseToken: "tok",
  };
  const built = (isReviewNeeded: boolean): AutomaticResultInterface => ({
    categoryCode: "billing",
    confidence: 0.9,
    isReviewNeeded,
    classifier: "c",
    rawOutput: {},
  });
  let claim: jest.Mock;
  let saveSuccess: jest.Mock;
  let decideAfterFailedClaim: jest.Mock;
  let build: jest.Mock;
  let recordFailure: jest.Mock;
  let classify: jest.Mock;
  let processor: ClassificationProcessor;

  beforeEach(() => {
    claim = jest.fn().mockResolvedValue(record);
    saveSuccess = jest.fn().mockResolvedValue(LeaseWriteResultEnum.SAVED);
    decideAfterFailedClaim = jest.fn();
    build = jest.fn().mockResolvedValue(built(false));
    recordFailure = jest.fn();
    classify = jest.fn().mockResolvedValue({ categoryCode: "billing", confidence: 0.9 });
    processor = new ClassificationProcessor(
      { claim } as unknown as RecordLeaseRepository,
      { saveSuccess } as unknown as ClassificationResultRepository,
      { decideAfterFailedClaim } as unknown as ClaimFailureService,
      { build } as unknown as AutomaticResultService,
      { record: recordFailure } as unknown as AttemptFailureService,
      {} as AppConfigService,
      settings,
      { name: "c", classify } as unknown as ClassifierInterface,
    );
  });

  it("claims, classifies and saves a confident result as classified", async () => {
    await expect(processor.handle(jobData)).resolves.toBe(ProcessOutcomeEnum.CLASSIFIED);
    expect(claim).toHaveBeenCalledWith(
      "r1",
      expect.any(String),
      settings.classification.leaseMs,
      settings.classification.maxAttempts,
    );
    expect(classify).toHaveBeenCalledWith(
      {
        title: "Title",
        description: "Desc",
        source: "src",
        date: "2026-10-25T00:00:00.000Z",
        attemptNo: 1,
      },
      expect.any(AbortSignal),
    );
    expect(saveSuccess).toHaveBeenCalledWith(record, built(false), expect.any(Number));
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it("returns needs-review when the built result needs review", async () => {
    build.mockResolvedValue(built(true));
    await expect(processor.handle(jobData)).resolves.toBe(ProcessOutcomeEnum.NEEDS_REVIEW);
  });

  it("returns lost-lease and drops the result when the save lost the lease", async () => {
    saveSuccess.mockResolvedValue(LeaseWriteResultEnum.LOST_LEASE);
    await expect(processor.handle(jobData)).resolves.toBe(ProcessOutcomeEnum.LOST_LEASE);
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it("hands a failed claim to the claim-failure service and returns its decision", async () => {
    claim.mockResolvedValue(null);
    decideAfterFailedClaim.mockResolvedValue(ProcessOutcomeEnum.SKIPPED);
    await expect(processor.handle(jobData)).resolves.toBe(ProcessOutcomeEnum.SKIPPED);
    expect(decideAfterFailedClaim).toHaveBeenCalledWith("r1", {
      recordId: "r1",
      generation: 2,
      requestId: "req",
    });
    expect(classify).not.toHaveBeenCalled();
  });

  it("lets the lease-held error from the claim-failure service reach BullMQ", async () => {
    claim.mockResolvedValue(null);
    decideAfterFailedClaim.mockRejectedValue(new LeaseHeldException("held"));
    await expect(processor.handle(jobData)).rejects.toBeInstanceOf(LeaseHeldException);
  });

  it("records a classifier failure through the attempt-failure service", async () => {
    const failure = new Error("model down");
    classify.mockRejectedValue(failure);
    recordFailure.mockRejectedValue(new Error("retry"));
    await expect(processor.handle(jobData)).rejects.toThrow("retry");
    expect(recordFailure).toHaveBeenCalledWith(record, failure, expect.any(AbortSignal), expect.any(Number), {
      recordId: "r1",
      generation: 2,
      requestId: "req",
    });
    expect(saveSuccess).not.toHaveBeenCalled();
  });

  it("records an invalid-answer error from the builder as an attempt failure", async () => {
    const failure = new PermanentClassificationException("bad confidence");
    build.mockRejectedValue(failure);
    recordFailure.mockResolvedValue(ProcessOutcomeEnum.LOST_LEASE);
    await expect(processor.handle(jobData)).resolves.toBe(ProcessOutcomeEnum.LOST_LEASE);
    expect(recordFailure.mock.calls[0][1]).toBe(failure);
  });

  it("records a save failure through the attempt-failure service", async () => {
    const failure = new Error("db error");
    saveSuccess.mockRejectedValue(failure);
    recordFailure.mockResolvedValue(ProcessOutcomeEnum.LOST_LEASE);
    await processor.handle(jobData);
    expect(recordFailure.mock.calls[0][1]).toBe(failure);
  });

  it("gives up on a classifier that ignores the timeout signal", async () => {
    const short = { ...settings, classification: { ...settings.classification, classifierTimeoutMs: 10 } };
    const timedOutProcessor = new ClassificationProcessor(
      { claim } as unknown as RecordLeaseRepository,
      { saveSuccess } as unknown as ClassificationResultRepository,
      { decideAfterFailedClaim } as unknown as ClaimFailureService,
      { build } as unknown as AutomaticResultService,
      { record: recordFailure } as unknown as AttemptFailureService,
      {} as AppConfigService,
      short,
      {
        name: "c",
        classify: jest.fn().mockReturnValue(new Promise(() => undefined)),
      } as unknown as ClassifierInterface,
    );
    recordFailure.mockResolvedValue(ProcessOutcomeEnum.LOST_LEASE);
    await timedOutProcessor.handle(jobData);
    expect(recordFailure).toHaveBeenCalledTimes(1);
    expect(recordFailure.mock.calls[0][2].aborted).toBe(true);
    expect(saveSuccess).not.toHaveBeenCalled();
  });

  it("process() delegates the job data to handle()", async () => {
    await expect(processor.process({ data: jobData } as Job<ClassificationJobDataInterface>)).resolves.toBe(
      ProcessOutcomeEnum.CLASSIFIED,
    );
  });
});
