import { DEFAULT_APP_SETTINGS } from "../../../infrastructure/constants/settings/app-settings.constant";
import { AppSettingsInterface } from "../../../infrastructure/contracts/interfaces/settings/app-settings.interface";
import { StuckRecordInterface } from "../../../infrastructure/contracts/interfaces/sql-db/classification/claimed-record.interface";
import { RecordLeaseRepository } from "../../../infrastructure/repositories/classification/record-lease.repository";
import { CLASSIFICATION_FAILURE_MESSAGE } from "../constants/worker/classification-failure-message.constant";
import { RecordStatusEnum } from "../contracts/enums/lifecycle/record-status.enum";
import { EnsureJobResultEnum } from "../contracts/enums/queue/ensure-job-result.enum";
import { ClassificationJobService } from "./classification-job.service";
import { SweeperService } from "./sweeper.service";

describe("SweeperService", () => {
  const settings: AppSettingsInterface = {
    ...DEFAULT_APP_SETTINGS,
    sweeper: { ...DEFAULT_APP_SETTINGS.sweeper, batchSize: 2 },
  };
  const maxAttempts = settings.classification.maxAttempts;
  const stuck = (
    id: string,
    status: RecordStatusEnum = RecordStatusEnum.PENDING,
    attemptCount = 0,
    retryGeneration = 0,
  ): StuckRecordInterface => ({ id, status, attemptCount, retryGeneration, updatedAtText: `ts-${id}` });
  let findStuckRecords: jest.Mock;
  let markExhausted: jest.Mock;
  let ensureJob: jest.Mock;
  let service: SweeperService;

  beforeEach(() => {
    findStuckRecords = jest.fn().mockResolvedValue([]);
    markExhausted = jest.fn().mockResolvedValue(true);
    ensureJob = jest.fn().mockResolvedValue(EnsureJobResultEnum.ADDED);
    service = new SweeperService(
      { findStuckRecords, markExhausted } as unknown as RecordLeaseRepository,
      { ensureJob } as unknown as ClassificationJobService,
      settings,
    );
  });

  it("returns an all-zero report when nothing is stuck", async () => {
    await expect(service.sweep()).resolves.toEqual({
      scanned: 0,
      requeued: 0,
      alreadyQueued: 0,
      exhausted: 0,
      skippedActive: 0,
    });
    expect(findStuckRecords).toHaveBeenCalledWith(settings.sweeper.pendingGraceMs, 2, null);
  });

  it("ensures a job for a stuck PENDING record at its retry generation", async () => {
    findStuckRecords.mockResolvedValue([stuck("a", RecordStatusEnum.PENDING, 0, 4)]);
    const report = await service.sweep();
    expect(ensureJob).toHaveBeenCalledWith({ recordId: "a", generation: 4 });
    expect(report).toMatchObject({ scanned: 1, requeued: 1 });
  });

  it("marks an exhausted PROCESSING record failed and does not queue it", async () => {
    findStuckRecords.mockResolvedValue([stuck("a", RecordStatusEnum.PROCESSING, maxAttempts)]);
    const report = await service.sweep();
    expect(markExhausted).toHaveBeenCalledWith("a", maxAttempts, CLASSIFICATION_FAILURE_MESSAGE.ATTEMPTS_EXHAUSTED);
    expect(ensureJob).not.toHaveBeenCalled();
    expect(report).toMatchObject({ scanned: 1, exhausted: 1, requeued: 0 });
  });

  it("does not count an exhausted record another worker already settled", async () => {
    markExhausted.mockResolvedValue(false);
    findStuckRecords.mockResolvedValue([stuck("a", RecordStatusEnum.PROCESSING, maxAttempts)]);
    const report = await service.sweep();
    expect(report).toMatchObject({ scanned: 1, exhausted: 0 });
  });

  it("requeues a PROCESSING record that still has attempts left", async () => {
    findStuckRecords.mockResolvedValue([stuck("a", RecordStatusEnum.PROCESSING, maxAttempts - 1)]);
    const report = await service.sweep();
    expect(markExhausted).not.toHaveBeenCalled();
    expect(report.requeued).toBe(1);
  });

  it("requeues a PENDING record even when its attempts are used up", async () => {
    findStuckRecords.mockResolvedValue([stuck("a", RecordStatusEnum.PENDING, maxAttempts)]);
    const report = await service.sweep();
    expect(markExhausted).not.toHaveBeenCalled();
    expect(report.requeued).toBe(1);
  });

  it("counts each ensureJob result under its own counter", async () => {
    findStuckRecords.mockResolvedValueOnce([stuck("a"), stuck("b")]).mockResolvedValueOnce([]);
    ensureJob
      .mockResolvedValueOnce(EnsureJobResultEnum.EXISTS)
      .mockResolvedValueOnce(EnsureJobResultEnum.SKIPPED_ACTIVE);
    const report = await service.sweep();
    expect(report).toMatchObject({ scanned: 2, alreadyQueued: 1, skippedActive: 1, requeued: 0 });
  });

  it("counts a re-added job as requeued", async () => {
    findStuckRecords.mockResolvedValue([stuck("a")]);
    ensureJob.mockResolvedValue(EnsureJobResultEnum.RE_ADDED);
    await expect(service.sweep()).resolves.toMatchObject({ requeued: 1 });
  });

  it("pages with the last record as cursor until a short page", async () => {
    findStuckRecords
      .mockResolvedValueOnce([stuck("a"), stuck("b")])
      .mockResolvedValueOnce([stuck("c"), stuck("d")])
      .mockResolvedValueOnce([stuck("e")]);
    const report = await service.sweep();
    expect(findStuckRecords).toHaveBeenCalledTimes(3);
    expect(findStuckRecords).toHaveBeenNthCalledWith(2, settings.sweeper.pendingGraceMs, 2, {
      updatedAtText: "ts-b",
      id: "b",
    });
    expect(findStuckRecords).toHaveBeenNthCalledWith(3, settings.sweeper.pendingGraceMs, 2, {
      updatedAtText: "ts-d",
      id: "d",
    });
    expect(report).toMatchObject({ scanned: 5, requeued: 5 });
  });

  it("stops after an empty page following a full one", async () => {
    findStuckRecords.mockResolvedValueOnce([stuck("a"), stuck("b")]).mockResolvedValueOnce([]);
    const report = await service.sweep();
    expect(findStuckRecords).toHaveBeenCalledTimes(2);
    expect(report.scanned).toBe(2);
  });
});
