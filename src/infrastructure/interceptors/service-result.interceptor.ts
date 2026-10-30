import { CallHandler, ExecutionContext, HttpStatus, Injectable, NestInterceptor } from "@nestjs/common";
import { Response } from "express";
import { Observable, map } from "rxjs";
import { IDEMPOTENT_REPLAYED_HEADER, IDEMPOTENT_REPLAYED_VALUE } from "../constants/http/http-header.constant";
import { ServiceResultInterface } from "../contracts/interfaces/http/service-result.interface";
import { ServiceResultUtil } from "../utils/http/service-result.util";

/**
 * Global response step: controllers only pass a service's answer through. A plain body goes out
 * as it is, with the route's status. A service result has its flags applied (`isCreated` → 201,
 * `isReplayed` → `Idempotent-Replayed: true`) and only its `data` is sent.
 */
@Injectable()
export class ServiceResultInterceptor implements NestInterceptor {
  /**
   * Applies a service result's flags to the response.
   *
   * @param context - The current request, to reach the response object.
   * @param next - The rest of the pipeline, ending in the controller.
   * @returns The body to send.
   */
  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();
    return next
      .handle()
      .pipe(
        map((value: unknown) =>
          ServiceResultUtil.isServiceResult(value) ? ServiceResultInterceptor.applyFlags(value, response) : value,
        ),
      );
  }

  /**
   * Sets the status and headers a service result asks for and unwraps its body.
   *
   * Steps:
   * 1. Answer 201 when the call created something.
   * 2. Mark a replayed result.
   * 3. Return the body.
   *
   * @param result - The service result.
   * @param response - The HTTP response.
   * @returns The body to send.
   */
  private static applyFlags(result: ServiceResultInterface<unknown>, response: Response): unknown {
    // 1. Answer 201 when the call created something.
    if (result.isCreated) {
      response.status(HttpStatus.CREATED);
    }

    // 2. Mark a replayed result.
    if (result.isReplayed) {
      response.setHeader(IDEMPOTENT_REPLAYED_HEADER, IDEMPOTENT_REPLAYED_VALUE);
    }

    // 3. Return the body.
    return result.data;
  }
}
