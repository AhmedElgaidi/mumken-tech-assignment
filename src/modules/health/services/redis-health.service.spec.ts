import { HealthIndicatorService } from "@nestjs/terminus";
import { QueueProducerService } from "../../../infrastructure/services/queue/queue-producer.service";
import { RedisHealthStateEnum } from "../contracts/enums/redis-health-state.enum";
import { RedisHealthService } from "./redis-health.service";

describe("RedisHealthService", () => {
  const up = jest.fn((data: Record<string, unknown>) => ({ redis: { status: "up", ...data } }));
  const indicatorService = { check: jest.fn(() => ({ up })) };
  const queueProducer = { ping: jest.fn() };
  const service = new RedisHealthService(
    indicatorService as unknown as HealthIndicatorService,
    queueProducer as unknown as QueueProducerService,
  );

  beforeEach(() => jest.clearAllMocks());

  it("reports up when Redis answers", async () => {
    queueProducer.ping.mockResolvedValue(true);

    await expect(service.check("redis")).resolves.toEqual({ redis: { status: "up", state: RedisHealthStateEnum.UP } });
    expect(indicatorService.check).toHaveBeenCalledWith("redis");
  });

  it("reports degraded, still up, when Redis does not answer", async () => {
    queueProducer.ping.mockResolvedValue(false);

    await expect(service.check("redis")).resolves.toEqual({
      redis: { status: "up", state: RedisHealthStateEnum.DEGRADED },
    });
  });
});
