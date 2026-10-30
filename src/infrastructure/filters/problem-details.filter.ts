import { PostgresErrorUtil } from "../utils/sql-db/postgres-error.util";
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Request, Response } from "express";
import { ConnectionError } from "sequelize";
import { ErrorCodeEnum } from "../contracts/enums/http/error-code.enum";
import { ProblemException } from "../exceptions/http/problem.exception";
import { ProblemBodyInterface } from "../contracts/interfaces/http/problem-body.interface";
import { ProblemUtil } from "../utils/http/problem.util";
import { PROBLEM_CONTENT_TYPE } from "../constants/http/problem.constant";
import { RequestIdHelper } from "../helpers/http/request-id.helper";

/**
 * Renders every error as problem+json and never leaks stack traces. Only unhandled errors and
 * database outages are logged, each with the request id; client errors (4xx) are not.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  /** Error code for each plain HTTP status Nest throws; any other status maps to `INTERNAL_ERROR`. */
  private static readonly ERROR_CODE_BY_HTTP_STATUS: Record<number, ErrorCodeEnum> = {
    [HttpStatus.BAD_REQUEST]: ErrorCodeEnum.VALIDATION_FAILED,
    [HttpStatus.UNAUTHORIZED]: ErrorCodeEnum.UNAUTHORIZED,
    [HttpStatus.NOT_FOUND]: ErrorCodeEnum.NOT_FOUND,
    [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCodeEnum.PAYLOAD_TOO_LARGE,
    [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: ErrorCodeEnum.UNSUPPORTED_MEDIA_TYPE,
  };

  private readonly logger = new Logger(ProblemDetailsFilter.name);

  /**
   * Renders one thrown error as problem+json.
   *
   * Steps:
   * 1. Read the request, the response and the request id.
   * 2. Build the problem body that matches the kind of error.
   * 3. Send the problem response.
   *
   * @param exception - Whatever was thrown.
   * @param host - The current request context.
   */
  public catch(exception: unknown, host: ArgumentsHost): void {
    // 1. Read the request, the response and the request id.
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const requestId = RequestIdHelper.get(request);

    // 2. Build the problem body that matches the kind of error.
    const body = this.buildProblemBody(exception, requestId);

    // 3. Send the problem response.
    response.status(body.status).type(PROBLEM_CONTENT_TYPE).send(JSON.stringify(body));
  }

  /**
   * Picks the problem body for one thrown value, logging server faults with the request id.
   *
   * Steps:
   * 1. Keep the status and code of a problem exception.
   * 2. Map any other HTTP exception by its status.
   * 3. Report an unreachable database as 503.
   * 4. Report anything else as an unhandled 500.
   *
   * @param exception - Whatever was thrown.
   * @param requestId - Id of the request, or `undefined` when none was assigned.
   * @returns The problem body to send.
   */
  private buildProblemBody(exception: unknown, requestId: string | undefined): ProblemBodyInterface {
    // 1. Keep the status and code of a problem exception.
    if (exception instanceof ProblemException) {
      return ProblemUtil.build(exception.getStatus(), exception.code, exception.message, requestId, exception.extras);
    }

    // 2. Map any other HTTP exception by its status.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return ProblemUtil.build(
        status,
        ProblemDetailsFilter.ERROR_CODE_BY_HTTP_STATUS[status] ?? ErrorCodeEnum.INTERNAL_ERROR,
        exception.message,
        requestId,
      );
    }

    // 3. Report an unreachable database as 503.
    if (exception instanceof ConnectionError) {
      this.logger.error({ error: ProblemDetailsFilter.describe(exception), requestId }, "database unavailable");
      return ProblemUtil.build(
        HttpStatus.SERVICE_UNAVAILABLE,
        ErrorCodeEnum.DATABASE_UNAVAILABLE,
        "The database is unavailable; retry later",
        requestId,
      );
    }

    // 4. Report anything else as an unhandled 500.
    this.logger.error({ error: ProblemDetailsFilter.describe(exception), requestId }, "unhandled error");
    return ProblemUtil.build(
      HttpStatus.INTERNAL_SERVER_ERROR,
      ErrorCodeEnum.INTERNAL_ERROR,
      "Unexpected error",
      requestId,
    );
  }

  /**
   * The parts of an error that are safe to log: name, message, Postgres code and constraint, stack.
   * Database errors also carry the SQL text and bound values (record content), which stay out of logs.
   *
   * @param exception - The thrown value.
   * @returns A plain object for the log line.
   */
  private static describe(exception: unknown): Record<string, unknown> {
    if (!(exception instanceof Error)) {
      return { message: String(exception) };
    }
    return {
      name: exception.name,
      message: exception.message,
      code: PostgresErrorUtil.getCode(exception),
      constraint: PostgresErrorUtil.getConstraint(exception),
      stack: exception.stack,
    };
  }
}
