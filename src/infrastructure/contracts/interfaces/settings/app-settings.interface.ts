import { ClassificationSettingsInterface } from "./classification-settings.interface";
import { ImportSettingsInterface } from "./import-settings.interface";
import { QueueSettingsInterface } from "./queue-settings.interface";
import { SweeperSettingsInterface } from "./sweeper-settings.interface";

/** Tuning values of the service. They live in code, not in the environment; tests override them. */
export interface AppSettingsInterface {
  /** Queue key prefix. */
  queue: QueueSettingsInterface;
  /** Worker concurrency, attempts, timing and the review threshold. */
  classification: ClassificationSettingsInterface;
  /** Sweeper schedule and batch. */
  sweeper: SweeperSettingsInterface;
  /** Import size limits. */
  import: ImportSettingsInterface;
}
