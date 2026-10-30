import { RetrySkippedInterface } from "./retry-skipped.interface";

/** What retrying an import did. */
export interface ImportRetryResultInterface {
  /** Records moved back to PENDING by this call. */
  requeued: number;
  /** Records left alone, by reason. */
  skipped: RetrySkippedInterface;
}
