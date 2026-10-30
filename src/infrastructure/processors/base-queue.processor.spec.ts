import { Job, Worker } from "bullmq";
import { Redis } from "ioredis";
import { BaseQueueProcessor } from "./base-queue.processor";
import { AppConfigService } from "../services/env/app-config.service";
import { QueueNameEnum } from "../contracts/enums/queue/queue-name.enum";
import { AppSettingsInterface } from "../contracts/interfaces/settings/app-settings.interface";
import { RedisConnectionHelper } from "../helpers/queue/redis-connection.helper";

jest.mock("bullmq");
jest.mock("../helpers/queue/redis-connection.helper");

class TestProcessor extends BaseQueueProcessor<{ n: number }, number> {
  public readonly events: string[] = [];
  public fakeConnection: unknown;

  public constructor(config: AppConfigService, settings: AppSettingsInterface) {
    super(QueueNameEnum.CLASSIFICATION, 4, config, settings);
  }

  public process(job: Job<{ n: number }>): Promise<number> {
    return Promise.resolve(job.data.n * 2);
  }

  protected override async afterWorkerStarted(connection: Redis): Promise<void> {
    this.events.push(`started:${String(connection === this.fakeConnection)}`);
    return Promise.resolve();
  }

  protected override async beforeConnectionClosed(): Promise<void> {
    this.events.push("closing");
    return Promise.resolve();
  }
}

describe("BaseQueueProcessor", () => {
  const workerMock = Worker as unknown as jest.Mock;
  let worker: { on: jest.Mock; close: jest.Mock };
  let connection: { disconnect: jest.Mock };

  const build = (isConsumerEnabled: boolean): TestProcessor => {
    const processor = new TestProcessor(
      { getRedisUrl: () => "redis://cache" } as unknown as AppConfigService,
      {
        queue: { prefix: "pfx", isConsumerEnabled },
      } as AppSettingsInterface,
    );
    processor.fakeConnection = connection;
    jest.spyOn(processor["logger"], "log").mockImplementation(() => undefined);
    return processor;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    worker = { on: jest.fn(), close: jest.fn().mockResolvedValue(undefined) };
    connection = { disconnect: jest.fn() };
    workerMock.mockImplementation(() => worker);
    (RedisConnectionHelper.createWorker as jest.Mock).mockReturnValue(connection);
  });

  it("starts nothing when the consumer is disabled", async () => {
    const processor = build(false);

    await processor.onApplicationBootstrap();

    expect(workerMock).not.toHaveBeenCalled();
    expect(RedisConnectionHelper.createWorker).not.toHaveBeenCalled();
    expect(processor.events).toEqual([]);
  });

  it("starts a worker with the queue name, prefix, concurrency and connection when enabled", async () => {
    const processor = build(true);

    await processor.onApplicationBootstrap();

    expect(RedisConnectionHelper.createWorker).toHaveBeenCalledWith("redis://cache");
    expect(workerMock).toHaveBeenCalledWith(QueueNameEnum.CLASSIFICATION, expect.any(Function), {
      connection,
      prefix: "pfx",
      concurrency: 4,
    });
    expect(worker.on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("runs process for each job the worker hands over", async () => {
    await build(true).onApplicationBootstrap();
    const handler = workerMock.mock.calls[0][1] as (job: Job<{ n: number }>) => Promise<number>;

    await expect(handler({ data: { n: 21 } } as Job<{ n: number }>)).resolves.toBe(42);
  });

  it("runs the afterWorkerStarted hook with the worker connection", async () => {
    const processor = build(true);

    await processor.onApplicationBootstrap();

    expect(processor.events).toEqual(["started:true"]);
  });

  it("logs worker errors instead of throwing", async () => {
    const processor = build(true);
    const logged = jest.spyOn(processor["logger"], "error").mockImplementation(() => undefined);
    await processor.onApplicationBootstrap();
    const onError = worker.on.mock.calls[0][1] as (error: Error) => void;

    onError(new Error("redis blip"));

    expect(logged).toHaveBeenCalledTimes(1);
  });

  it("closes the worker, runs the hook, then disconnects on shutdown", async () => {
    const processor = build(true);
    await processor.onApplicationBootstrap();
    processor.events.length = 0;

    await processor.onApplicationShutdown();

    expect(worker.close).toHaveBeenCalledTimes(1);
    expect(processor.events).toEqual(["closing"]);
    expect(connection.disconnect).toHaveBeenCalledTimes(1);
  });

  it("shuts down cleanly when it never started", async () => {
    const processor = build(false);

    await expect(processor.onApplicationShutdown()).resolves.toBeUndefined();
    expect(connection.disconnect).not.toHaveBeenCalled();
    expect(processor.events).toEqual(["closing"]);
  });
});
