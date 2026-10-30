import request from "supertest";
import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import { getConnectionToken } from "@nestjs/sequelize";
import { Test } from "@nestjs/testing";
import { Sequelize } from "sequelize-typescript";
import { App } from "supertest/types";
import { AppModule } from "../../../../src/app.module";
import { Queue } from "bullmq";
import { ClassificationJobDataInterface } from "../../../../src/modules/classification/contracts/interfaces/queue/classification-job.interface";
import { QueueNameEnum } from "../../../../src/infrastructure/contracts/enums/queue/queue-name.enum";
import { QueueProducerService } from "../../../../src/infrastructure/services/queue/queue-producer.service";
import { CLASSIFIER } from "../../../../src/modules/classification/constants/worker/classifier.token";
import { HttpAppHelper } from "../../../../src/infrastructure/helpers/http/http-app.helper";
import { FakeClassifierDriver } from "../../classifier/fake-classifier.driver";
import { WaitForUtil } from "../../wait/utils/wait-for.util";
import { TimeoutUtil } from "../../../../src/infrastructure/utils/timeout/timeout.util";
import {
  EXTERNAL_ID_SUFFIX_LENGTH,
  PROCESSING_DRAIN_TIMEOUT_MS,
  QUEUE_OBLITERATE_TIMEOUT_MS,
  QUEUE_PREFIX_SUFFIX_LENGTH,
  TEST_APP_SETTINGS,
  TRUNCATE_MAX_ATTEMPTS,
  TRUNCATE_RETRY_DELAY_MS,
  TRUNCATED_TABLES,
} from "../constants/test-app.constant";
import { CreateTestAppOptionsInterface } from "../contracts/interfaces/create-test-app-options.interface";
import { TestAppInterface } from "../contracts/interfaces/test-app.interface";
import { APP_SETTINGS } from "../../../../src/infrastructure/constants/settings/app-settings.token";
import { DEFAULT_APP_SETTINGS } from "../../../../src/infrastructure/constants/settings/app-settings.constant";
import { AppSettingsInterface } from "../../../../src/infrastructure/contracts/interfaces/settings/app-settings.interface";

/** Builds the app under test and the data it needs. */
export class TestAppHelper {
  /**
   * The HTTP app and (optionally) the worker in one process, with the fake classifier and a
   * queue prefix of its own, so test files never see each other's jobs.
   *
   * Steps:
   * 1. Apply the environment overrides.
   * 2. Build the settings and the fake classifier.
   * 3. Create the app.
   * 4. Look up the connection and the queue.
   * 5. Return the app and its handles.
   *
   * @param options - Which parts to mount and which environment to apply.
   * @returns The running app and the handles to drive it.
   */
  public static async create(options: CreateTestAppOptionsInterface = {}): Promise<TestAppInterface> {
    // 1. Apply the environment overrides.
    Object.assign(process.env, options.env ?? {});

    // 2. Build the settings and the fake classifier.
    const settings = TestAppHelper.buildSettings(options);
    const fake = new FakeClassifierDriver();

    // 3. Create the app.
    const app = await TestAppHelper.createApp(settings, fake);

    // 4. Look up the connection and the queue.
    const sequelize = app.get<Sequelize>(getConnectionToken());
    const queue = app.get(QueueProducerService).getQueue<ClassificationJobDataInterface>(QueueNameEnum.CLASSIFICATION);

    // 5. Return the app and its handles.
    return {
      app,
      fake,
      settings,
      sequelize,
      queue,
      http: () => request(app.getHttpServer() as App),
      truncate: () => TestAppHelper.drainAndTruncate(queue, sequelize),
      close: async () => {
        await TestAppHelper.obliterateQueue(queue);
        await app.close();
      },
    };
  }

  /**
   * Wipe the data tables, retrying because TRUNCATE can deadlock with a live worker.
   *
   * @param sequelize - The database connection.
   * @throws Error the last failure, after {@link TRUNCATE_MAX_ATTEMPTS} attempts.
   */
  public static async truncateAll(sequelize: Sequelize): Promise<void> {
    const tables = TRUNCATED_TABLES.map((table) => `"${table}"`).join(", ");
    for (let attempt = 1; ; attempt += 1) {
      try {
        await sequelize.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
        return;
      } catch (error) {
        if (attempt >= TRUNCATE_MAX_ATTEMPTS) throw error;
        await TimeoutUtil.delay(TRUNCATE_RETRY_DELAY_MS);
      }
    }
  }

  /**
   * A valid record payload.
   *
   * @param overrides - Fields to replace on the default record.
   * @returns The record, with a fresh `externalId` unless overridden.
   */
  public static buildRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      externalId: `ext-${randomUUID().slice(0, EXTERNAL_ID_SUFFIX_LENGTH)}`,
      title: "Court rules on new licence regulation",
      description: "The regulation changes licence rules.",
      source: "gov-news",
      date: "2026-10-25",
      ...overrides,
    };
  }

  /**
   * The settings of this app: the defaults, the fast test values, the caller's overrides, a
   * queue prefix of its own, and consumers switched off when `runWorkers` is `false`.
   *
   * Steps:
   * 1. Stack the settings layers.
   * 2. Define the merge of one settings group.
   * 3. Return the merged settings.
   *
   * @param options - Which parts to mount and which settings to override.
   * @returns The settings of the app.
   */
  private static buildSettings(options: CreateTestAppOptionsInterface): AppSettingsInterface {
    // 1. Stack the settings layers.
    const layers = [TEST_APP_SETTINGS, options.settings ?? {}];

    // 2. Define the merge of one settings group.
    const merge = <TGroup extends keyof AppSettingsInterface>(group: TGroup): AppSettingsInterface[TGroup] =>
      Object.assign({}, DEFAULT_APP_SETTINGS[group], ...layers.map((layer) => layer[group] ?? {}));

    // 3. Return the merged settings.
    return {
      queue: {
        ...merge("queue"),
        prefix: `test-${randomUUID().slice(0, QUEUE_PREFIX_SUFFIX_LENGTH)}`,
        isConsumerEnabled: options.runWorkers !== false,
      },
      classification: merge("classification"),
      sweeper: merge("sweeper"),
      import: merge("import"),
    };
  }

  /**
   * Compile the testing module, create the Nest app, configure HTTP and start it.
   *
   * Steps:
   * 1. Compile the testing module with the fake classifier and the settings.
   * 2. Create the Nest app.
   * 3. Configure HTTP and start the app.
   * 4. Return the app.
   *
   * @param settings - The settings of the app.
   * @param fake - The fake classifier to use.
   * @returns The started app.
   */
  private static async createApp(
    settings: AppSettingsInterface,
    fake: FakeClassifierDriver,
  ): Promise<INestApplication> {
    // 1. Compile the testing module with the fake classifier and the settings.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot()] })
      .overrideProvider(CLASSIFIER)
      .useValue(fake)
      .overrideProvider(APP_SETTINGS)
      .useValue(settings)
      .compile();

    // 2. Create the Nest app.
    const app = moduleRef.createNestApplication({ bodyParser: false, logger: false });

    // 3. Configure HTTP and start the app.
    HttpAppHelper.configure(app);
    await app.init();

    // 4. Return the app.
    return app;
  }

  /**
   * Stop queued work, let running jobs finish, then wipe the tables.
   *
   * Steps:
   * 1. Empty the queue.
   * 2. Wait until no record is processing.
   * 3. Wipe the data tables.
   *
   * @param queue - The classification queue.
   * @param sequelize - The database connection.
   */
  private static async drainAndTruncate(
    queue: Queue<ClassificationJobDataInterface>,
    sequelize: Sequelize,
  ): Promise<void> {
    // 1. Empty the queue.
    await TestAppHelper.obliterateQueue(queue);

    // 2. Wait until no record is processing.
    await WaitForUtil.until(async () => {
      const [rows] = await sequelize.query(
        `SELECT count(*)::int AS n FROM "Record" WHERE "classificationStatus" = 'PROCESSING'`,
      );
      return (rows as Array<{ n: number }>)[0]!.n === 0;
    }, PROCESSING_DRAIN_TIMEOUT_MS).catch(() => undefined);

    // 3. Wipe the data tables.
    await TestAppHelper.truncateAll(sequelize);
  }

  /** Empty the queue; a slow or unreachable Redis is tolerated. */
  private static async obliterateQueue(queue: Queue<ClassificationJobDataInterface>): Promise<void> {
    await TimeoutUtil.withTimeout(queue.obliterate({ force: true }), QUEUE_OBLITERATE_TIMEOUT_MS).catch(
      () => undefined,
    );
  }
}
