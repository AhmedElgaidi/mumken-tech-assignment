import { ErrorCodeEnum } from "../../enums/http/error-code.enum";

/**
 * The RFC 9457 error body every failing response carries. Extra members (e.g. `errors`) ride
 * along through the index signature.
 */
export interface ProblemBodyInterface {
  /** Any extra member merged in for one error kind. */
  [extra: string]: unknown;
  /** Stable URN identifying the error kind. */
  type: string;
  /** Standard HTTP reason phrase of `status`. */
  title: string;
  /** HTTP status code of the response. */
  status: number;
  /** What went wrong and how to fix it, for the caller. */
  detail: string;
  /** Machine-readable error code clients branch on. */
  code: ErrorCodeEnum;
  /** Id of the request, to quote in a support report; absent when none was assigned. */
  requestId?: string;
}
