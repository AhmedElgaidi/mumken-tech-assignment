/** Tuning of the mock classifier: how slow it is, how often it fails and how to replay it. */
export interface MockClassifierOptionsInterface {
  /** Lowest simulated latency, in milliseconds. */
  minLatencyMs: number;
  /** Highest simulated latency, in milliseconds. */
  maxLatencyMs: number;
  /** Chance that a call fails with a retryable error, from 0 (never) to 1 (always). */
  failureRate: number;
  /** Seed of the random generator, so a run can be replayed. */
  seed: number;
}
