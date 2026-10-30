/** Names of the BullMQ jobs this module produces. */
export enum ClassificationJobNameEnum {
  /** Classify one record (classification queue). */
  CLASSIFY = "classify",
  /** One sweeper pass (maintenance queue). */
  SWEEP = "sweep",
}
