/** Time limits on promises: a fixed timeout, an abort signal, or a cancellable wait. */
export class TimeoutUtil {
  /**
   * Limits how long a promise may take.
   *
   * @param promise - The work to wait for.
   * @param timeoutMs - Milliseconds allowed before giving up.
   * @returns The promise's value when it settles in time.
   * @throws Error `timed out after <ms> ms` when it does not; the promise's own rejection is passed on as an `Error`.
   */
  public static withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs);
      promise.then(
        (settled) => {
          clearTimeout(timer);
          resolve(settled);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(TimeoutUtil.toError(error));
        },
      );
    });
  }

  /**
   * Races a promise against an abort signal.
   *
   * @param promise - The work to wait for.
   * @param signal - The signal that cancels the wait.
   * @returns The promise's value when it settles before the abort.
   * @throws Error The signal's reason (as an `Error`) when it aborts first, or the promise's own rejection.
   */
  public static raceWithSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) {
      return Promise.reject(TimeoutUtil.toError(signal.reason));
    }
    return new Promise<T>((resolve, reject) => {
      const onAbort = (): void => reject(TimeoutUtil.toError(signal.reason));
      signal.addEventListener("abort", onAbort, { once: true });
      promise.then(
        (settled) => {
          signal.removeEventListener("abort", onAbort);
          resolve(settled);
        },
        (error: unknown) => {
          signal.removeEventListener("abort", onAbort);
          reject(TimeoutUtil.toError(error));
        },
      );
    });
  }

  /**
   * Waits for a fixed time without keeping the process alive.
   *
   * @param delayMs - Milliseconds to wait.
   * @param signal - Optional signal that ends the wait early.
   * @returns Nothing, once the time has passed.
   * @throws Error The signal's reason (as an `Error`) when it aborts first.
   */
  public static delay(delayMs: number, signal?: AbortSignal): Promise<void> {
    const wait = new Promise<void>((resolve) => setTimeout(resolve, delayMs).unref?.());
    return signal ? TimeoutUtil.raceWithSignal(wait, signal) : wait;
  }

  /**
   * Wraps a non-`Error` rejection reason in an `Error`.
   *
   * @param reason - Whatever a promise rejected with or a signal aborted with.
   * @returns The reason itself when it is an `Error`, else an `Error` carrying its text.
   */
  private static toError(reason: unknown): Error {
    return reason instanceof Error ? reason : new Error(String(reason));
  }
}
