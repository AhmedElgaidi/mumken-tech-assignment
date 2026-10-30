import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { AppConfigService } from "./infrastructure/services/env/app-config.service";
import { HttpAppHelper } from "./infrastructure/helpers/http/http-app.helper";

/**
 * Entry point of the one process: builds the app (HTTP API, classification worker and sweeper),
 * applies the shared HTTP configuration and listens on `PORT`.
 *
 * Steps:
 * 1. Create the app with buffered logs and no default body parser.
 * 2. Route logs through the Pino logger and apply the shared HTTP configuration.
 * 3. Listen on the configured port.
 *
 * @returns Resolves once the server is listening.
 */
async function bootstrap(): Promise<void> {
  // 1. Create the app with buffered logs and no default body parser.
  const app = await NestFactory.create(AppModule.forRoot(), {
    bufferLogs: true,
    bodyParser: false,
  });

  // 2. Route logs through the Pino logger and apply the shared HTTP configuration.
  app.useLogger(app.get(Logger));
  HttpAppHelper.configure(app);

  // 3. Listen on the configured port.
  await app.listen(app.get(AppConfigService).getPort());
}

void bootstrap();
