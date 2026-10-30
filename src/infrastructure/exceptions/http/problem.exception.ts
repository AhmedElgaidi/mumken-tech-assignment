import { HttpException } from "@nestjs/common";
import { ErrorCodeEnum } from "../../contracts/enums/http/error-code.enum";
import { ProblemExtrasType } from "../../contracts/types/http/problem-extras.type";

/** An HTTP error rendered as RFC 9457 problem+json by the global filter. */
export class ProblemException extends HttpException {
  /** Machine-readable error code rendered in the body. */
  public readonly code: ErrorCodeEnum;
  /** Extra members merged into the problem+json body. */
  public readonly extras: ProblemExtrasType;

  /**
   * Creates a problem exception.
   *
   * Steps:
   * 1. Pass the detail and status to the HTTP exception.
   * 2. Store the error code.
   * 3. Store the extra members.
   *
   * @param status - HTTP status code of the response.
   * @param code - Machine-readable error code.
   * @param detail - What went wrong and how to fix it.
   * @param extras - Extra members merged into the body.
   */
  public constructor(status: number, code: ErrorCodeEnum, detail: string, extras: ProblemExtrasType = {}) {
    // 1. Pass the detail and status to the HTTP exception.
    super(detail, status);

    // 2. Store the error code.
    this.code = code;

    // 3. Store the extra members.
    this.extras = extras;
  }
}
