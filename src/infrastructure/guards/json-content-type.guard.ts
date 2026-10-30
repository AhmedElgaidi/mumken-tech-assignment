import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { Request } from "express";
import { ErrorCodeEnum } from "../contracts/enums/http/error-code.enum";
import { ProblemException } from "../exceptions/http/problem.exception";

/** 415 for a body that is not JSON. A guard runs before validation, so the client gets the real cause. */
@Injectable()
export class JsonContentTypeGuard implements CanActivate {
  /**
   * Requires a JSON content type.
   *
   * Steps:
   * 1. Read the request.
   * 2. Reject any content type that is not JSON.
   * 3. Allow the request.
   *
   * @param context - The current request context.
   * @returns `true` when the body is `application/json`.
   * @throws ProblemException 415 `UNSUPPORTED_MEDIA_TYPE` for any other content type.
   */
  public canActivate(context: ExecutionContext): boolean {
    // 1. Read the request.
    const request = context.switchToHttp().getRequest<Request>();

    // 2. Reject any content type that is not JSON.
    if (!request.is("application/json")) {
      throw new ProblemException(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        ErrorCodeEnum.UNSUPPORTED_MEDIA_TYPE,
        "Send the body as application/json",
      );
    }

    // 3. Allow the request.
    return true;
  }
}
