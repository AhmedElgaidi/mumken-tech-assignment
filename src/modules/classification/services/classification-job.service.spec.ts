import { DEFAULT_APP_SETTINGS } from "../../../infrastructure/constants/settings/app-settings.constant";
import { QueueNameEnum } from "../../../infrastructure/contracts/enums/queue/queue-name.enum";
import { QueueProducerService } from "../../../infrastructure/services/queue/queue-producer.service";
import { CLASSIFICATION_JOB_OPTION } from "../constants/queue/classification-job.constant";
import { ClassificationJobNameEnum } from "../contracts/enums/queue/classification-job-name.enum";
import { EnsureJobResultEnum } from "../contracts/enums/queue/ensure-job-result.enum";
import { ClassificationJobService } from "./classification-job.service";

describe("ClassificationJobService", () => {
  const settings = DEFAULT_APP_SETTINGS;
  let addJobs: jest.Mock;
  let addJob: jest.Mock;
  let getJob: jest.Mock;
  let service: ClassificationJobService;

  beforeEach(() => {
    addJobs = jest.fn().mockResolvedValue(undefined);
    addJob = jest.fn().mockResolvedValue(undefined);
    getJob = jest.fn().mockResolvedValue(undefined);
    service = new ClassificationJobService({ addJobs, addJob, getJob } as unknown as QueueProducerService, settings);
  });

  describe("getJobOptions", () => {
    it("builds the id, attempts, backoff and retention", () => {
      expect(service.getJobOptions("abc", 3)).toEqual({
        jobId: "classify-abc-g3",
        attempts: settings.classification.maxAttempts + CLASSIFICATION_JOB_OPTION.ATTEMPTS_SAFETY_MARGIN,
        backoff: { type: CLASSIFICATION_JOB_OPTION.BACKOFF_TYPE, delay: settings.classification.backoffMs },
        removeOnComplete: true,
        removeOnFail: { age: CLASSIFICATION_JOB_OPTION.FAILED_RETENTION_SECONDS },
      });
    });
  });

  describe("enqueue", () => {
    it("returns true without touching the queue for no targets", async () => {
      await expect(service.enqueue([])).resolves.toBe(true);
      expect(addJobs).not.toHaveBeenCalled();
    });

    it("adds one classify job per target with the request id", async () => {
      await expect(
        service.enqueue(
          [
            { recordId: "a", generation: 0 },
            { recordId: "b", generation: 2 },
          ],
          "req-1",
        ),
      ).resolves.toBe(true);
      expect(addJobs).toHaveBeenCalledWith(QueueNameEnum.CLASSIFICATION, [
        {
          name: ClassificationJobNameEnum.CLASSIFY,
          data: { recordId: "a", generation: 0, requestId: "req-1" },
          opts: service.getJobOptions("a", 0),
        },
        {
          name: ClassificationJobNameEnum.CLASSIFY,
          data: { recordId: "b", generation: 2, requestId: "req-1" },
          opts: service.getJobOptions("b", 2),
        },
      ]);
    });

    it("returns false and warns instead of throwing when the queue fails", async () => {
      addJobs.mockRejectedValue(new Error("redis down"));
      const warn = jest.spyOn(Reflect.get(service, "logger") as { warn: () => void }, "warn").mockImplementation();
      await expect(service.enqueue([{ recordId: "a", generation: 0 }])).resolves.toBe(false);
      expect(warn).toHaveBeenCalledTimes(1);
    });
  });

  describe("ensureJob", () => {
    const target = { recordId: "a", generation: 1 };
    const jobWith = (state: string, remove: jest.Mock = jest.fn().mockResolvedValue(undefined)) => ({
      getState: jest.fn().mockResolvedValue(state),
      remove,
    });

    it("adds the job when none is stored", async () => {
      await expect(service.ensureJob(target)).resolves.toBe(EnsureJobResultEnum.ADDED);
      expect(getJob).toHaveBeenCalledWith(QueueNameEnum.CLASSIFICATION, "classify-a-g1");
      expect(addJob).toHaveBeenCalledWith(
        QueueNameEnum.CLASSIFICATION,
        ClassificationJobNameEnum.CLASSIFY,
        { recordId: "a", generation: 1 },
        service.getJobOptions("a", 1),
      );
    });

    it.each(["waiting", "active", "delayed", "prioritized", "waiting-children"])(
      "does nothing for a %s job",
      async (state) => {
        const job = jobWith(state);
        getJob.mockResolvedValue(job);
        await expect(service.ensureJob(target)).resolves.toBe(EnsureJobResultEnum.EXISTS);
        expect(job.remove).not.toHaveBeenCalled();
        expect(addJob).not.toHaveBeenCalled();
      },
    );

    it.each(["completed", "failed"])("removes a %s job and adds it again", async (state) => {
      const job = jobWith(state);
      getJob.mockResolvedValue(job);
      await expect(service.ensureJob(target)).resolves.toBe(EnsureJobResultEnum.RE_ADDED);
      expect(job.remove).toHaveBeenCalledTimes(1);
      expect(addJob).toHaveBeenCalledTimes(1);
    });

    it("skips when the removal fails because the job turned active", async () => {
      getJob.mockResolvedValue(jobWith("failed", jest.fn().mockRejectedValue(new Error("locked"))));
      await expect(service.ensureJob(target)).resolves.toBe(EnsureJobResultEnum.SKIPPED_ACTIVE);
      expect(addJob).not.toHaveBeenCalled();
    });
  });
});
