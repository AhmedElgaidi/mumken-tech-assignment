import { HttpStatus, INestApplication, Logger, ValidationPipe } from "@nestjs/common";
import { json, NextFunction, Request, Response } from "express";
import { ErrorCodeEnum } from "../../contracts/enums/http/error-code.enum";
import { ProblemDetailsFilter } from "../../filters/problem-details.filter";
import { ProblemUtil } from "../../utils/http/problem.util";
import { ServiceResultInterceptor } from "../../interceptors/service-result.interceptor";
import { PROBLEM_CONTENT_TYPE } from "../../constants/http/problem.constant";
import { RequestIdHelper } from "./request-id.helper";
import { ValidationExceptionFactory } from "../../factories/validation-exception.factory";
import { AppConfigService } from "../../services/env/app-config.service";
import { API_PREFIX } from "../../constants/http/api-prefix.constant";
import { APP_SETTINGS } from "../../constants/settings/app-settings.token";
import { AppSettingsInterface } from "../../contracts/interfaces/settings/app-settings.interface";

/**
 * Wires the HTTP pipeline (body limit, prefix, validation, error filter, response interceptor)
 * onto a Nest app. Shared by `main.ts` and the e2e tests, so the tests run exactly what
 * production runs.
 */
export class HttpAppHelper {
  /**
   * Applies the shared HTTP configuration.
   *
   * Steps:
   * 1. Install the JSON body parser with the configured size limit.
   * 2. Render body-parser errors as problem+json.
   * 3. Set the global route prefix.
   * 4. Install the strict validation pipe.
   * 5. Install the problem+json filter, the service-result interceptor and the shutdown hooks.
   * 6. Warn when production runs without an API key.
   *
   * @param app - The Nest application to configure.
   */
  public static configure(app: INestApplication): void {
    // 1. Install the JSON body parser with the configured size limit.
    app.use(
      json({
        limit: app.get<AppSettingsInterface>(APP_SETTINGS).import.maxBodyBytes,
        type: ["application/json", "application/*+json"],
      }),
    );
    // 2. Render body-parser errors as problem+json.
    app.use(HttpAppHelper.bodyParserErrorHandler);

    // 3. Set the global route prefix.
    app.setGlobalPrefix(API_PREFIX);

    // 4. Install the strict validation pipe.
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: (errors) => ValidationExceptionFactory.create(errors),
      }),
    );

    // 5. Install the problem+json filter, the service-result interceptor and the shutdown hooks.
    app.useGlobalFilters(new ProblemDetailsFilter());
    app.useGlobalInterceptors(new ServiceResultInterceptor());
    app.enableShutdownHooks();

    // 6. Warn when production runs without an API key.
    HttpAppHelper.warnWhenProductionHasNoApiKey(app.get(AppConfigService));
  }

  /**
   * Logs a warning when production runs with the API-key check switched off.
   *
   * @param config - The validated environment.
   */
  private static warnWhenProductionHasNoApiKey(config: AppConfigService): void {
    if (!config.isProduction() || config.getApiKey()) {
      return;
    }
    new Logger(HttpAppHelper.name).warn("API_KEY is empty: every route is open to anyone who can reach the port");
  }

  /**
   * Renders body-parser errors as problem+json; they happen before Nest's filters run.
   *
   * Steps:
   * 1. Continue the chain when there is no error.
   * 2. Pick the status from the error type.
   * 3. Build the problem body.
   * 4. Send the problem response.
   *
   * @internal
   * @see {@link HttpAppHelper.configure}
   * @param error - The error body-parser passed on, if any.
   * @param request - The Express request.
   * @param response - The Express response.
   * @param next - Continues the chain when there is no error.
   */
  private static bodyParserErrorHandler(
    error: { type?: string; status?: number } | undefined,
    request: Request,
    response: Response,
    next: NextFunction,
  ): void {
    // 1. Continue the chain when there is no error.
    if (!error) {
      next();
      return;
    }

    // 2. Pick the status from the error type.
    const isTooLarge = error.type === "entity.too.large";
    const status = isTooLarge ? HttpStatus.PAYLOAD_TOO_LARGE : (error.status ?? HttpStatus.BAD_REQUEST);

    // 3. Build the problem body.
    const body = ProblemUtil.build(
      status,
      isTooLarge ? ErrorCodeEnum.PAYLOAD_TOO_LARGE : ErrorCodeEnum.MALFORMED_JSON,
      isTooLarge
        ? "The request body is larger than IMPORT_MAX_BODY_BYTES; split the batch"
        : "The request body is not valid JSON",
      RequestIdHelper.get(request),
    );

    // 4. Send the problem response.
    response.status(status).type(PROBLEM_CONTENT_TYPE).send(JSON.stringify(body));
  }
}
