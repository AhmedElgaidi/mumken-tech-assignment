/** Payload of one classification job. The database, not the job, holds the record's state. */
export interface ClassificationJobDataInterface {
  /** Record to classify (its public UUID). */
  recordId: string;
  /** Retry generation the job belongs to; a client retry bumps it. */
  generation: number;
  /** Request id of the HTTP call that enqueued the job, for log correlation; omitted by the sweeper. */
  requestId?: string;
}

/** One record to enqueue, with the retry generation it is currently in. */
export interface ClassificationTargetInterface {
  /** Record to classify (its public UUID). */
  recordId: string;
  /** Retry generation the record is currently in. */
  generation: number;
}
