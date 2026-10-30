import { Injectable } from "@nestjs/common";
import { HealthIndicatorResult, HealthIndicatorService } from "@nestjs/terminus";
import { QueueProducerService } from "../../../infrastructure/services/queue/queue-producer.service";
import { RedisHealthStateEnum } from "../contracts/enums/redis-health-state.enum";

/**
 * Reports Redis without failing readiness: imports still work while Redis is down (records
 * wait as PENDING and the sweeper enqueues them later), so Redis is "degraded", not "down".
 */
@Injectable()
export class RedisHealthService {
  public constructor(
    private readonly indicatorService: HealthIndicatorService,
    private readonly queueProducer: QueueProducerService,
  ) {}

  /**
   * Pings Redis and reports it as up or degraded; never reports it as down.
   *
   * @param key - Key of this indicator in the readiness report.
   * @returns An indicator result that is always `up`, with the Redis state attached.
   */
  public async check(key: string): Promise<HealthIndicatorResult> {
    const isReachable = await this.queueProducer.ping();
    return this.indicatorService.check(key).up({
      state: isReachable ? RedisHealthStateEnum.UP : RedisHealthStateEnum.DEGRADED,
    });
  }
}
