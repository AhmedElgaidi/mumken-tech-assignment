import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { BulkJobOptions, Job, JobsOptions, Queue } from "bullmq";
import { Redis } from "ioredis";
import { AppConfigService } from "../env/app-config.service";
import { APP_SETTINGS } from "../../constants/settings/app-settings.token";
import { AppSettingsInterface } from "../../contracts/interfaces/settings/app-settings.interface";
import { TimeoutUtil } from "../../utils/timeout/timeout.util";
import { RedisConnectionHelper } from "../../helpers/queue/redis-connection.helper";
import { QUEUE_PRODUCER_TIMEOUT_MS } from "../../constants/queue/queue-producer-timeout.constant";
import { QueueNameEnum } from "../../contracts/enums/queue/queue-name.enum";

/**
 * Feature-agnostic producer: owns one fail-fast Redis connection and one BullMQ `Queue` per
 * `QueueNameEnum`, and exposes only what callers need. What a job means is the caller's
 * business; the queue is an accelerator, PostgreSQL stays the source of truth.
 */
@Injectable()
export class QueueProducerService implements OnModuleDestroy {
  private readonly connection: Redis;
  private readonly queues = new Map<QueueNameEnum, Queue>();

  /**
   * Opens the Redis producer connection shared by every queue.
   *
   * @param config - The app config, for the Redis URL.
   * @param settings - The app settings, for the queue prefix.
   */
  public constructor(
    config: AppConfigService,
    @Inject(APP_SETTINGS) private readonly settings: AppSettingsInterface,
  ) {
    this.connection = RedisConnectionHelper.createProducer(config.getRedisUrl());
  }

  /**
   * Returns the queue of a name, creating it on first use.
   *
   * Steps:
   * 1. Return the queue when it already exists.
   * 2. Create the queue on the shared connection and ignore its error events.
   *
   * @param queueName - Which queue.
   * @returns The BullMQ queue of that name.
   */
  public getQueue<TData = unknown>(queueName: QueueNameEnum): Queue<TData, unknown, string> {
    // 1. Return the queue when it already exists.
    const existingQueue = this.queues.get(queueName);
    if (existingQueue) {
      return existingQueue as Queue<TData, unknown, string>;
    }

    // 2. Create the queue on the shared connection and ignore its error events.
    const queue = new Queue(queueName, { connection: this.connection, prefix: this.settings.queue.prefix });
    queue.on("error", () => undefined);
    this.queues.set(queueName, queue);
    return queue as Queue<TData, unknown, string>;
  }

  /**
   * Adds a batch of jobs, bounded by the enqueue timeout. Throws when Redis is unavailable;
   * the caller decides how to degrade.
   *
   * @param queueName - Queue to add to.
   * @param jobs - Jobs to add, each with its name, data and options.
   */
  public async addJobs(
    queueName: QueueNameEnum,
    jobs: Array<{ name: string; data: object; opts?: BulkJobOptions }>,
  ): Promise<void> {
    await TimeoutUtil.withTimeout(this.getQueue<object>(queueName).addBulk(jobs), QUEUE_PRODUCER_TIMEOUT_MS.ENQUEUE);
  }

  /**
   * Adds one job. BullMQ silently ignores an add whose job id already exists.
   *
   * @param queueName - Queue to add to.
   * @param jobName - Name of the job.
   * @param data - Job payload.
   * @param options - BullMQ job options.
   */
  public async addJob(queueName: QueueNameEnum, jobName: string, data: object, options: JobsOptions): Promise<void> {
    await this.getQueue<object>(queueName).add(jobName, data, options);
  }

  /**
   * Looks a job up by id.
   *
   * @param queueName - Queue to look in.
   * @param jobId - BullMQ job id.
   * @returns The stored job (remove it with `job.remove()`), or `undefined`.
   */
  public getJob<TData>(queueName: QueueNameEnum, jobId: string): Promise<Job<TData, unknown, string> | undefined> {
    return this.getQueue<TData>(queueName).getJob(jobId);
  }

  /**
   * Pings Redis within a short timeout.
   *
   * @returns `true` when Redis answered `PONG`, `false` on any failure or timeout.
   */
  public async ping(): Promise<boolean> {
    try {
      const reply = await TimeoutUtil.withTimeout(this.connection.ping(), QUEUE_PRODUCER_TIMEOUT_MS.PING);
      return reply === "PONG";
    } catch {
      return false;
    }
  }

  /**
   * Closes the queues and the Redis connection on shutdown. `close()` waits for Redis, so it is
   * bounded by a timeout: a dead Redis must not block shutdown.
   */
  public async onModuleDestroy(): Promise<void> {
    await TimeoutUtil.withTimeout(
      Promise.all([...this.queues.values()].map((queue) => queue.close())),
      QUEUE_PRODUCER_TIMEOUT_MS.CLOSE,
    ).catch(() => undefined);
    this.connection.disconnect();
  }
}
