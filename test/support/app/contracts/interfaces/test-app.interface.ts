import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { Sequelize } from "sequelize-typescript";
import { Queue } from "bullmq";
import { ClassificationJobDataInterface } from "../../../../../src/modules/classification/contracts/interfaces/queue/classification-job.interface";
import { FakeClassifierDriver } from "../../../classifier/fake-classifier.driver";
import { AppSettingsInterface } from "../../../../../src/infrastructure/contracts/interfaces/settings/app-settings.interface";

/** The running app under test and the handles a test needs to drive and inspect it. */
export interface TestAppInterface {
  /** The initialised Nest application. */
  app: INestApplication;

  /** Starts a supertest request against the app's HTTP server. */
  http: () => ReturnType<typeof request>;

  /** The scripted classifier that replaces the real one. */
  fake: FakeClassifierDriver;

  /** The settings this app runs with (its own queue prefix included). */
  settings: AppSettingsInterface;

  /** The database connection, for raw SQL assertions. */
  sequelize: Sequelize;

  /** The raw classification queue. */
  queue: Queue<ClassificationJobDataInterface>;

  /** Drains the queue and empties the data tables (not `Category`). */
  truncate: () => Promise<void>;

  /** Drains the queue and shuts the app down. */
  close: () => Promise<void>;
}
