import { Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { Job, Worker } from "bullmq";
import { Redis } from "ioredis";
import { AppConfigService } from "../services/env/app-config.service";
import { AppSettingsInterface } from "../contracts/interfaces/settings/app-settings.interface";
import { RedisConnectionHelper } from "../helpers/queue/redis-connection.helper";
import { QueueNameEnum } from "../contracts/enums/queue/queue-name.enum";

/**
 * Consumer side of one BullMQ queue. A subclass names its queue and concurrency and implements
 * `process`; this class opens the worker connection at startup, logs worker errors, and on
 * shutdown waits for active jobs before it closes. Nothing starts when
 * `settings.queue.isConsumerEnabled` is `false`.
 */
export abstract class BaseQueueProcessor<TJobData, TResult> implements OnApplicationBootstrap, OnApplicationShutdown {
  /** Logger named after the subclass, so lines say which processor wrote them. */
  protected readonly logger = new Logger(this.constructor.name);
  private worker: Worker<TJobData, TResult> | null = null;
  private connection: Redis | null = null;

  protected constructor(
    private readonly queueName: QueueNameEnum,
    private readonly concurrency: number,
    private readonly baseConfig: AppConfigService,
    private readonly baseSettings: AppSettingsInterface,
  ) {}

  /**
   * Runs one job of the queue.
   *
   * @param job - The BullMQ job.
   * @returns The job result BullMQ stores.
   */
  public abstract process(job: Job<TJobData>): Promise<TResult>;

  /**
   * Starts consuming the queue, then runs `afterWorkerStarted`.
   *
   * Steps:
   * 1. Skip when consumers are disabled.
   * 2. Open the worker connection and start the worker.
   * 3. Run the subclass hook.
   */
  public async onApplicationBootstrap(): Promise<void> {
    // 1. Skip when consumers are disabled.
    if (!this.baseSettings.queue.isConsumerEnabled) {
      return;
    }
    // 2. Open the worker connection and start the worker.
    this.connection = RedisConnectionHelper.createWorker(this.baseConfig.getRedisUrl());
    this.worker = new Worker<TJobData, TResult>(this.queueName, (job: Job<TJobData>) => this.process(job), {
      connection: this.connection,
      prefix: this.baseSettings.queue.prefix,
      concurrency: this.concurrency,
    });
    this.worker.on("error", (error) => this.logger.error({ err: error, queue: this.queueName }, "queue worker error"));
    this.logger.log({ queue: this.queueName, concurrency: this.concurrency }, "queue worker started");
    // 3. Run the subclass hook.
    await this.afterWorkerStarted(this.connection);
  }

  /**
   * Waits for active jobs to finish, then closes the connection; leases make a hard kill safe anyway.
   *
   * Steps:
   * 1. Close the worker and wait for active jobs.
   * 2. Run the subclass hook.
   * 3. Disconnect from Redis.
   */
  public async onApplicationShutdown(): Promise<void> {
    // 1. Close the worker and wait for active jobs.
    await this.worker?.close();

    // 2. Run the subclass hook.
    await this.beforeConnectionClosed();

    // 3. Disconnect from Redis.
    this.connection?.disconnect();
  }

  /**
   * Hook run once the worker is consuming. Does nothing by default.
   *
   * @param _connection - The worker's Redis connection, for queues the subclass opens.
   */
  protected async afterWorkerStarted(_connection: Redis): Promise<void> {
    return Promise.resolve();
  }

  /** Hook run after the worker closed and before its connection does. Does nothing by default. */
  protected async beforeConnectionClosed(): Promise<void> {
    return Promise.resolve();
  }
}
