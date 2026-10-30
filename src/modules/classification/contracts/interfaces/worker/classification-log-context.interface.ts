/** Fields added to every log line written while one classification job runs. */
export interface ClassificationLogContextInterface {
  /** Public id of the record being classified. */
  recordId: string;
  /** Retry generation of the record. */
  generation: number;
  /** Request id of the HTTP request that queued the job, when there was one. */
  requestId?: string;
}
