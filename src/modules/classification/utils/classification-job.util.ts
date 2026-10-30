/** Builds the identifiers BullMQ uses for classification jobs. */
export class ClassificationJobUtil {
  /**
   * Builds the BullMQ job id: one job per record per retry generation. BullMQ forbids `:` in
   * custom ids, hence the dashes.
   *
   * @param recordId - Record the job classifies.
   * @param generation - Retry generation of the record.
   * @returns The deterministic job id.
   */
  public static getJobId(recordId: string, generation: number): string {
    return `classify-${recordId}-g${generation}`;
  }
}
