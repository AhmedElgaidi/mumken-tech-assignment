import { Controller, Get } from "@nestjs/common";
import { HealthService } from "../services/health.service";

/**
 * Liveness and readiness probes.
 *
 * @route /health (api)
 */
@Controller("health")
export class HealthController {
  public constructor(private readonly healthService: HealthService) {}

  /**
   * Report that the process is up.
   *
   * @route GET /health/live
   *
   * @returns The liveness result.
   */
  @Get("live")
  public checkLiveness(): ReturnType<HealthService["checkLiveness"]> {
    return this.healthService.checkLiveness();
  }

  /**
   * Report whether the database answers; Redis is reported but not required.
   *
   * @route GET /health/ready
   *
   * @returns The readiness result.
   */
  @Get("ready")
  public checkReadiness(): ReturnType<HealthService["checkReadiness"]> {
    return this.healthService.checkReadiness();
  }
}
