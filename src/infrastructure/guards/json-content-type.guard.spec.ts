import { ExecutionContext } from "@nestjs/common";
import { JsonContentTypeGuard } from "./json-content-type.guard";
import { ErrorCodeEnum } from "../contracts/enums/http/error-code.enum";
import { ProblemException } from "../exceptions/http/problem.exception";

describe("JsonContentTypeGuard", () => {
  const guard = new JsonContentTypeGuard();
  const contextFor = (isJson: string | false | null): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ is: jest.fn().mockReturnValue(isJson) }) }),
    }) as unknown as ExecutionContext;

  it("allows an application/json body", () => {
    expect(guard.canActivate(contextFor("json"))).toBe(true);
  });

  it.each<[string | false | null]>([[false], [null]])(
    "rejects a non-JSON or missing content type (%p) with 415",
    (isJson) => {
      let caught: unknown;
      try {
        guard.canActivate(contextFor(isJson));
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ProblemException);
      expect((caught as ProblemException).getStatus()).toBe(415);
      expect((caught as ProblemException).code).toBe(ErrorCodeEnum.UNSUPPORTED_MEDIA_TYPE);
    },
  );

  it("rejects a bodiless request when the route applies the guard to it", () => {
    expect(() => guard.canActivate(contextFor(null))).toThrow(ProblemException);
  });
});
