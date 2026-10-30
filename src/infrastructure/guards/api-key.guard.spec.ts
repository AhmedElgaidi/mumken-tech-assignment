import { ExecutionContext } from "@nestjs/common";
import { ApiKeyGuard } from "./api-key.guard";
import { ErrorCodeEnum } from "../contracts/enums/http/error-code.enum";
import { ProblemException } from "../exceptions/http/problem.exception";
import { AppConfigService } from "../services/env/app-config.service";

describe("ApiKeyGuard", () => {
  const contextFor = (path: string, header?: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ path, header: (name: string) => (name === "x-api-key" ? header : undefined) }),
      }),
    }) as unknown as ExecutionContext;

  const guardWith = (key: string | undefined): ApiKeyGuard =>
    new ApiKeyGuard({ getApiKey: () => key } as unknown as AppConfigService);

  it("allows everything when the key is empty", () => {
    expect(guardWith("").canActivate(contextFor("/api/v1/records"))).toBe(true);
    expect(guardWith(undefined).canActivate(contextFor("/api/v1/records"))).toBe(true);
  });

  it("allows the right key", () => {
    expect(guardWith("s3cret").canActivate(contextFor("/api/v1/records", "s3cret"))).toBe(true);
  });

  it("keeps health routes open without a key", () => {
    expect(guardWith("s3cret").canActivate(contextFor("/api/v1/health/ready"))).toBe(true);
  });

  it.each([
    ["missing", undefined],
    ["wrong, same length", "s3creX"],
    ["wrong, different length", "short"],
  ])("rejects a %s key with 401 UNAUTHORIZED", (_label, header) => {
    let caught: unknown;
    try {
      guardWith("s3cret").canActivate(contextFor("/api/v1/records", header));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ProblemException);
    expect((caught as ProblemException).getStatus()).toBe(401);
    expect((caught as ProblemException).code).toBe(ErrorCodeEnum.UNAUTHORIZED);
  });
});
