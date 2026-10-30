/** Every BullMQ queue of the service. */
export enum QueueNameEnum {
  /** One job per record to classify. */
  CLASSIFICATION = "classification",
  /** The repeating sweeper job, kept apart so it never takes classification concurrency. */
  MAINTENANCE = "maintenance",
}
