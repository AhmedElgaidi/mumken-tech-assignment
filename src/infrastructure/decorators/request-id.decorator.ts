import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Request } from "express";
import { RequestIdHelper } from "../helpers/http/request-id.helper";

/**
 * Injects the request id the logger assigned, so a controller never reads the raw request.
 *
 * @returns The parameter decorator.
 */
export function RequestIdDecorator(): ParameterDecorator {
  return createParamDecorator((_data: unknown, context: ExecutionContext): string | undefined =>
    RequestIdHelper.get(context.switchToHttp().getRequest<Request>()),
  )();
}
