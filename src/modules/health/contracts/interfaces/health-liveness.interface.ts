import { HealthStatusEnum } from "../enums/health-status.enum";

/** Body of the liveness probe. */
export interface HealthLivenessInterface {
  /** Always `ok` while the process can answer. */
  status: HealthStatusEnum;
}
