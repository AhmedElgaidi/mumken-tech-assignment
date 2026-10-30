/** A record a retry moved back to PENDING. */
export interface RequeuedRecordInterface {
  /** Public id of the record. */
  id: string;
  /** The new retry generation. */
  retryGeneration: number;
}
