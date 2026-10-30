import { TimeoutUtil } from "../../../../src/infrastructure/utils/timeout/timeout.util";
import { WAIT_FOR_DEFAULT_INTERVAL_MS, WAIT_FOR_DEFAULT_TIMEOUT_MS } from "../constants/wait-for.constant";

/** Polling helper for tests: wait for a condition instead of sleeping a fixed time. */
export class WaitForUtil {
  /**
   * Poll `check` until it returns a truthy value. A throwing check counts as "not yet".
   *
   * @param check - Returns the awaited value, or a falsy value to keep polling.
   * @param timeoutMs - How long to keep polling.
   * @param intervalMs - Pause between polls.
   * @returns The first truthy value `check` returned.
   * @throws Error when `timeoutMs` passes first; the message carries the last error `check` threw.
   *
   * Steps:
   * 1. Set the deadline.
   * 2. Poll the check until it returns a truthy value.
   * 3. Fail when the deadline passes, otherwise pause and poll again.
   */
  public static async until<T>(
    check: () => Promise<T | null | undefined | false>,
    timeoutMs = WAIT_FOR_DEFAULT_TIMEOUT_MS,
    intervalMs = WAIT_FOR_DEFAULT_INTERVAL_MS,
  ): Promise<T> {
    // 1. Set the deadline.
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;

    // 2. Poll the check until it returns a truthy value.
    for (;;) {
      try {
        const value = await check();
        if (value) {
          return value;
        }
      } catch (error) {
        lastError = error;
      }

      // 3. Fail when the deadline passes, otherwise pause and poll again.
      if (Date.now() > deadline) {
        throw new Error(
          `WaitForUtil.until timed out after ${timeoutMs} ms${lastError ? `: ${String(lastError)}` : ""}`,
        );
      }
      await TimeoutUtil.delay(intervalMs);
    }
  }
}
