import { Request } from "express";

/** Reads the id the logger assigned to a request. */
export class RequestIdHelper {
  /**
   * Reads the request id pino-http assigned (also echoed in `X-Request-Id`).
   *
   * @param request - The Express request.
   * @returns The id, or `undefined` when none was assigned.
   */
  public static get(request: Request): string | undefined {
    return typeof request.id === "string" ? request.id : undefined;
  }
}
