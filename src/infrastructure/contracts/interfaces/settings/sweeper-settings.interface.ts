/** How often the sweeper runs and what it picks up. */
export interface SweeperSettingsInterface {
  /** Milliseconds between sweeper runs. */
  intervalMs: number;
  /** Records one sweeper run re-queues at most. */
  batchSize: number;
  /** Milliseconds a PENDING record is left alone before the sweeper re-queues it. */
  pendingGraceMs: number;
}
