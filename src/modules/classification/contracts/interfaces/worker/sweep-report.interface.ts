/** What one sweeper pass found and did, returned by the maintenance job and logged. */
export interface SweepReportInterface {
  /** Candidate records examined. */
  scanned: number;
  /** Records that got a new job. */
  requeued: number;
  /** Records that already had a live job. */
  alreadyQueued: number;
  /** Records marked failed because every attempt was used. */
  exhausted: number;
  /** Records skipped because a worker took them while the sweeper looked. */
  skippedActive: number;
}
