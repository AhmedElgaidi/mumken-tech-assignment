/** BullMQ job states that matter to the producer. */
export enum ClassificationJobStateEnum {
  /** Queued and waiting for a worker. */
  WAITING = "waiting",
  /** A worker is running it now. */
  ACTIVE = "active",
  /** Waiting for its backoff delay before the next try. */
  DELAYED = "delayed",
  /** Queued with a priority, waiting for a worker. */
  PRIORITIZED = "prioritized",
  /** Waiting for child jobs to finish (not used here, but still a live state). */
  WAITING_CHILDREN = "waiting-children",
}
