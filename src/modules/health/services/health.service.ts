import { Injectable } from "@nestjs/common";
import { HealthCheckResult, HealthCheckService, SequelizeHealthIndicator } from "@nestjs/terminus";
import { HEALTH_CHECK } from "../constants/health-check.constant";
import { HealthStatusEnum } from "../contracts/enums/health-status.enum";
import { HealthLivenessInterface } from "../contracts/interfaces/health-liveness.interface";
import { RedisHealthService } from "./redis-health.service";

/** Answers the liveness and readiness probes; the HTTP layer only calls these two methods. */
@Injectable()
export class HealthService {
  public constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly databaseIndicator: SequelizeHealthIndicator,
    private readonly redisHealthService: RedisHealthService,
  ) {}

  /**
   * Checks that the dependencies answer. Ready when the database answers; Redis is reported
   * but never required.
   *
   * @returns The Terminus report with one entry per dependency.
   */
  public async checkReadiness(): Promise<HealthCheckResult> {
    return this.healthCheckService.check([
      () =>
        this.databaseIndicator.pingCheck(HEALTH_CHECK.DATABASE_KEY, {
          timeout: HEALTH_CHECK.DATABASE_TIMEOUT_MS,
        }),
      () => this.redisHealthService.check(HEALTH_CHECK.REDIS_KEY),
    ]);
  }

  /**
   * Reports that the process is up. Touches no dependency.
   *
   * @returns An `ok` status.
   */
  public checkLiveness(): HealthLivenessInterface {
    return { status: HealthStatusEnum.OK };
  }
}
