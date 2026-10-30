import { Queue } from "bullmq";
import { QueueProducerService } from "./queue-producer.service";
import { AppConfigService } from "../env/app-config.service";
import { QueueNameEnum } from "../../contracts/enums/queue/queue-name.enum";
import { AppSettingsInterface } from "../../contracts/interfaces/settings/app-settings.interface";
import { RedisConnectionHelper } from "../../helpers/queue/redis-connection.helper";

jest.mock("bullmq");
jest.mock("../../helpers/queue/redis-connection.helper");

interface FakeQueue {
  on: jest.Mock;
  add: jest.Mock;
  addBulk: jest.Mock;
  getJob: jest.Mock;
  close: jest.Mock;
}

describe("QueueProducerService", () => {
  const queueMock = Queue as unknown as jest.Mock;
  let connection: { ping: jest.Mock; disconnect: jest.Mock };
  let created: FakeQueue[];
  let service: QueueProducerService;

  beforeEach(() => {
    jest.clearAllMocks();
    created = [];
    queueMock.mockImplementation(() => {
      const fake: FakeQueue = {
        on: jest.fn(),
        add: jest.fn().mockResolvedValue(undefined),
        addBulk: jest.fn().mockResolvedValue([]),
        getJob: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
      };
      created.push(fake);
      return fake;
    });
    connection = { ping: jest.fn().mockResolvedValue("PONG"), disconnect: jest.fn() };
    (RedisConnectionHelper.createProducer as jest.Mock).mockReturnValue(connection);
    service = new QueueProducerService(
      { getRedisUrl: () => "redis://cache" } as unknown as AppConfigService,
      { queue: { prefix: "test-prefix", isConsumerEnabled: false } } as AppSettingsInterface,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("opens one producer connection from the configured URL", () => {
    expect(RedisConnectionHelper.createProducer).toHaveBeenCalledWith("redis://cache");
  });

  it("creates a queue on first use with the shared connection and prefix, and reuses it", () => {
    const first = service.getQueue(QueueNameEnum.CLASSIFICATION);
    const again = service.getQueue(QueueNameEnum.CLASSIFICATION);

    expect(again).toBe(first);
    expect(queueMock).toHaveBeenCalledTimes(1);
    expect(queueMock).toHaveBeenCalledWith(QueueNameEnum.CLASSIFICATION, { connection, prefix: "test-prefix" });
    expect(created[0].on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("keeps one queue per name", () => {
    const classification = service.getQueue(QueueNameEnum.CLASSIFICATION);
    const maintenance = service.getQueue(QueueNameEnum.MAINTENANCE);

    expect(maintenance).not.toBe(classification);
    expect(queueMock).toHaveBeenCalledTimes(2);
  });

  it("delegates addJob to the queue", async () => {
    await service.addJob(QueueNameEnum.CLASSIFICATION, "job", { id: 1 }, { jobId: "x" });

    expect(created[0].add).toHaveBeenCalledWith("job", { id: 1 }, { jobId: "x" });
  });

  it("delegates addJobs to addBulk", async () => {
    const jobs = [{ name: "job", data: { id: 1 } }];

    await service.addJobs(QueueNameEnum.CLASSIFICATION, jobs);

    expect(created[0].addBulk).toHaveBeenCalledWith(jobs);
  });

  it("rejects addJobs when Redis does not answer in time", async () => {
    jest.useFakeTimers();
    const queue = service.getQueue(QueueNameEnum.CLASSIFICATION) as unknown as FakeQueue;
    queue.addBulk.mockReturnValue(new Promise(() => undefined));

    const pending = service.addJobs(QueueNameEnum.CLASSIFICATION, []);
    const assertion = expect(pending).rejects.toThrow("timed out after 3000 ms");
    await jest.advanceTimersByTimeAsync(3000);

    await assertion;
  });

  it("looks a job up by id", async () => {
    const job = { id: "j1" };
    service.getQueue(QueueNameEnum.MAINTENANCE);
    created[0].getJob.mockResolvedValue(job);

    await expect(service.getJob(QueueNameEnum.MAINTENANCE, "j1")).resolves.toBe(job);
    expect(created[0].getJob).toHaveBeenCalledWith("j1");
  });

  describe("ping", () => {
    it("is true on PONG", async () => {
      await expect(service.ping()).resolves.toBe(true);
    });

    it("is false on another reply", async () => {
      connection.ping.mockResolvedValue("nope");

      await expect(service.ping()).resolves.toBe(false);
    });

    it("is false when Redis fails", async () => {
      connection.ping.mockRejectedValue(new Error("down"));

      await expect(service.ping()).resolves.toBe(false);
    });

    it("is false on timeout", async () => {
      jest.useFakeTimers();
      connection.ping.mockReturnValue(new Promise(() => undefined));

      const pending = service.ping();
      await jest.advanceTimersByTimeAsync(1000);

      await expect(pending).resolves.toBe(false);
    });
  });

  describe("onModuleDestroy", () => {
    it("closes every queue and disconnects", async () => {
      service.getQueue(QueueNameEnum.CLASSIFICATION);
      service.getQueue(QueueNameEnum.MAINTENANCE);

      await service.onModuleDestroy();

      expect(created[0].close).toHaveBeenCalled();
      expect(created[1].close).toHaveBeenCalled();
      expect(connection.disconnect).toHaveBeenCalledTimes(1);
    });

    it("still disconnects when closing a queue fails", async () => {
      service.getQueue(QueueNameEnum.CLASSIFICATION);
      created[0].close.mockRejectedValue(new Error("redis gone"));

      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
      expect(connection.disconnect).toHaveBeenCalledTimes(1);
    });

    it("does not wait past the close timeout for a dead Redis", async () => {
      jest.useFakeTimers();
      service.getQueue(QueueNameEnum.CLASSIFICATION);
      created[0].close.mockReturnValue(new Promise(() => undefined));

      const pending = service.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(2000);

      await pending;
      expect(connection.disconnect).toHaveBeenCalledTimes(1);
    });
  });
});
