/** Where the BullMQ queues keep their keys, and whether this process consumes them. */
export interface QueueSettingsInterface {
  /** Prefix on every Redis key the queues write; tests give each app its own. */
  prefix: string;
  /** When `false`, the process enqueues jobs but starts no consumer; tests then drive jobs by hand. */
  isConsumerEnabled: boolean;
}
