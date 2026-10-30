import { timingSafeEqual } from "node:crypto";
import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { Request } from "express";
import { AppConfigService } from "../services/env/app-config.service";
import { API_KEY_HEADER } from "../constants/http/http-header.constant";
import { ErrorCodeEnum } from "../contracts/enums/http/error-code.enum";
import { HealthPathUtil } from "../utils/http/health-path.util";
import { ProblemException } from "../exceptions/http/problem.exception";
import { API_PREFIX } from "../constants/http/api-prefix.constant";

/** Optional `X-API-Key` check; disabled when `API_KEY` is empty. Health stays open. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  public constructor(private readonly config: AppConfigService) {}

  /**
   * Checks the API key header against `API_KEY`.
   *
   * Steps:
   * 1. Allow the request when the check is off or the route is health.
   * 2. Compare the sent key with the expected key in constant time.
   * 3. Reject a missing or wrong key, or allow the request.
   *
   * @param context - The current request context.
   * @returns `true` when the check is off, the route is health, or the key matches.
   * @throws ProblemException 401 `UNAUTHORIZED` when the key is missing or wrong.
   */
  public canActivate(context: ExecutionContext): boolean {
    // 1. Allow the request when the check is off or the route is health.
    const expectedKey = this.config.getApiKey();
    const request = context.switchToHttp().getRequest<Request>();
    if (!expectedKey || HealthPathUtil.isHealthPath(request.path, API_PREFIX)) {
      return true;
    }

    // 2. Compare the sent key with the expected key in constant time.
    const sentBuffer = Buffer.from(request.header(API_KEY_HEADER) ?? "");
    const expectedBuffer = Buffer.from(expectedKey);

    // 3. Reject a missing or wrong key, or allow the request.
    if (sentBuffer.length !== expectedBuffer.length || !timingSafeEqual(sentBuffer, expectedBuffer)) {
      throw new ProblemException(HttpStatus.UNAUTHORIZED, ErrorCodeEnum.UNAUTHORIZED, "Send a valid X-API-Key header");
    }
    return true;
  }
}
