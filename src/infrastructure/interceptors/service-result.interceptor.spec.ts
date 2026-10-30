import { CallHandler, ExecutionContext, HttpStatus } from "@nestjs/common";
import { lastValueFrom, of } from "rxjs";
import { IDEMPOTENT_REPLAYED_HEADER, IDEMPOTENT_REPLAYED_VALUE } from "../constants/http/http-header.constant";
import { ServiceResultUtil } from "../utils/http/service-result.util";
import { ServiceResultInterceptor } from "./service-result.interceptor";

describe("ServiceResultInterceptor", () => {
  const run = async (value: unknown) => {
    const response = { status: jest.fn(), setHeader: jest.fn() };
    const context = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of(value) };
    const body = await lastValueFrom(new ServiceResultInterceptor().intercept(context, next));
    return { body, response };
  };

  it("sends a plain body unchanged and leaves the route's status alone", async () => {
    const { body, response } = await run({ data: [1] });
    expect(body).toEqual({ data: [1] });
    expect(response.status).not.toHaveBeenCalled();
    expect(response.setHeader).not.toHaveBeenCalled();
  });

  it("answers 201 and unwraps the body when the call created something", async () => {
    const { body, response } = await run(ServiceResultUtil.of({ id: "r" }, { isCreated: true }));
    expect(body).toEqual({ id: "r" });
    expect(response.status).toHaveBeenCalledWith(HttpStatus.CREATED);
  });

  it("marks a replay with the Idempotent-Replayed header and keeps the route's status", async () => {
    const { body, response } = await run(ServiceResultUtil.of({ id: "i" }, { isReplayed: true }));
    expect(body).toEqual({ id: "i" });
    expect(response.setHeader).toHaveBeenCalledWith(IDEMPOTENT_REPLAYED_HEADER, IDEMPOTENT_REPLAYED_VALUE);
    expect(response.status).not.toHaveBeenCalled();
  });
});
