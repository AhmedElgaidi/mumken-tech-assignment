import { STATUS_CODES } from "node:http";
import { ErrorCodeEnum } from "../../contracts/enums/http/error-code.enum";
import { ProblemExtrasType } from "../../contracts/types/http/problem-extras.type";
import { ProblemBodyInterface } from "../../contracts/interfaces/http/problem-body.interface";

/** Builds RFC 9457 problem bodies. */
export class ProblemUtil {
  /**
   * Builds one RFC 9457 body. `type` is a stable URN per code; there is no docs site to link.
   *
   * @param status - HTTP status code of the response.
   * @param code - Machine-readable error code.
   * @param detail - What went wrong and how to fix it.
   * @param requestId - Id of the request, or `undefined` when none was assigned.
   * @param extras - Extra members merged into the body (they win over the standard ones).
   * @returns The problem body.
   */
  public static build(
    status: number,
    code: ErrorCodeEnum,
    detail: string,
    requestId: string | undefined,
    extras: ProblemExtrasType = {},
  ): ProblemBodyInterface {
    return {
      type: `urn:problem:${code.toLowerCase().replace(/_/g, "-")}`,
      title: STATUS_CODES[status] ?? "Error",
      status,
      detail,
      code,
      requestId,
      ...extras,
    };
  }
}
