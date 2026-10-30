import { ArgumentsHost, HttpException, HttpStatus } from "@nestjs/common";
import { ConnectionError } from "sequelize";
import { ProblemDetailsFilter } from "./problem-details.filter";
import { ErrorCodeEnum } from "../contracts/enums/http/error-code.enum";
import { ProblemException } from "../exceptions/http/problem.exception";

interface SentResponse {
  status: number;
  contentType: string;
  body: Record<string, unknown>;
}

describe("ProblemDetailsFilter", () => {
  let filter: ProblemDetailsFilter;
  let sent: SentResponse;
  let logged: jest.SpyInstance;

  const runWithId = (exception: unknown, requestId: unknown): SentResponse => {
    const response = {
      status: jest.fn().mockImplementation((status: number) => {
        sent.status = status;
        return response;
      }),
      type: jest.fn().mockImplementation((contentType: string) => {
        sent.contentType = contentType;
        return response;
      }),
      send: jest.fn().mockImplementation((payload: string) => {
        sent.body = JSON.parse(payload) as Record<string, unknown>;
      }),
    };
    const host = {
      switchToHttp: () => ({ getRequest: () => ({ id: requestId }), getResponse: () => response }),
    } as unknown as ArgumentsHost;
    filter.catch(exception, host);
    return sent;
  };

  const run = (exception: unknown): SentResponse => runWithId(exception, "req-1");

  beforeEach(() => {
    filter = new ProblemDetailsFilter();
    sent = { status: 0, contentType: "", body: {} };
    logged = jest.spyOn(filter["logger"], "error").mockImplementation(() => undefined);
  });

  it("keeps the status, code, detail and extras of a ProblemException", () => {
    const result = run(
      new ProblemException(HttpStatus.CONFLICT, ErrorCodeEnum.STALE_CLASSIFICATION, "changed", { retryAfter: 5 }),
    );

    expect(result.status).toBe(409);
    expect(result.contentType).toBe("application/problem+json");
    expect(result.body).toMatchObject({
      status: 409,
      code: ErrorCodeEnum.STALE_CLASSIFICATION,
      detail: "changed",
      requestId: "req-1",
      retryAfter: 5,
    });
    expect(logged).not.toHaveBeenCalled();
  });

  it.each([
    [HttpStatus.BAD_REQUEST, ErrorCodeEnum.VALIDATION_FAILED],
    [HttpStatus.UNAUTHORIZED, ErrorCodeEnum.UNAUTHORIZED],
    [HttpStatus.NOT_FOUND, ErrorCodeEnum.NOT_FOUND],
    [HttpStatus.PAYLOAD_TOO_LARGE, ErrorCodeEnum.PAYLOAD_TOO_LARGE],
    [HttpStatus.UNSUPPORTED_MEDIA_TYPE, ErrorCodeEnum.UNSUPPORTED_MEDIA_TYPE],
  ])("maps a plain HttpException %i to %s without logging", (status, code) => {
    const result = run(new HttpException("nope", status));

    expect(result.status).toBe(status);
    expect(result.body).toMatchObject({ status, code, detail: "nope", requestId: "req-1" });
    expect(logged).not.toHaveBeenCalled();
  });

  it("maps an unmapped HttpException status to INTERNAL_ERROR", () => {
    const result = run(new HttpException("teapot", HttpStatus.I_AM_A_TEAPOT));

    expect(result.status).toBe(418);
    expect(result.body.code).toBe(ErrorCodeEnum.INTERNAL_ERROR);
  });

  it("reports a database connection error as 503 DATABASE_UNAVAILABLE and logs it", () => {
    const result = run(new ConnectionError(new Error("ECONNREFUSED")));

    expect(result.status).toBe(503);
    expect(result.body).toMatchObject({ code: ErrorCodeEnum.DATABASE_UNAVAILABLE, requestId: "req-1" });
    expect(logged).toHaveBeenCalledTimes(1);
  });

  it("reports an unknown error as 500 without leaking the message or the stack", () => {
    const error = new Error("secret internals");
    const result = run(error);

    expect(result.status).toBe(500);
    expect(result.body).toMatchObject({ code: ErrorCodeEnum.INTERNAL_ERROR, detail: "Unexpected error" });
    const text = JSON.stringify(result.body);
    expect(text).not.toContain("secret internals");
    expect(text).not.toContain("stack");
    expect(logged).toHaveBeenCalledTimes(1);
  });

  it("handles a thrown non-Error value as 500", () => {
    const result = run("boom");

    expect(result.status).toBe(500);
    expect(result.body.code).toBe(ErrorCodeEnum.INTERNAL_ERROR);
  });

  it("leaves requestId out when the request has no string id", () => {
    const result = runWithId(new HttpException("x", HttpStatus.NOT_FOUND), undefined);

    expect(result.body).not.toHaveProperty("requestId");
  });
});
