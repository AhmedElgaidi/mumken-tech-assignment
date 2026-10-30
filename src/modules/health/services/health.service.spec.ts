import { HealthCheckService, SequelizeHealthIndicator } from "@nestjs/terminus";
import { HEALTH_CHECK } from "../constants/health-check.constant";
import { HealthStatusEnum } from "../contracts/enums/health-status.enum";
import { HealthService } from "./health.service";
import { RedisHealthService } from "./redis-health.service";

describe("HealthService", () => {
  const healthCheckService = { check: jest.fn() };
  const databaseIndicator = { pingCheck: jest.fn() };
  const redisHealthService = { check: jest.fn() };
  const service = new HealthService(
    healthCheckService as unknown as HealthCheckService,
    databaseIndicator as unknown as SequelizeHealthIndicator,
    redisHealthService as unknown as RedisHealthService,
  );

  beforeEach(() => jest.resetAllMocks());

  it("reports liveness ok without touching dependencies", () => {
    expect(service.checkLiveness()).toEqual({ status: HealthStatusEnum.OK });
    expect(healthCheckService.check).not.toHaveBeenCalled();
    expect(databaseIndicator.pingCheck).not.toHaveBeenCalled();
  });

  it("checks the database with a timeout and Redis for readiness", async () => {
    const report = { status: "ok", info: {}, error: {}, details: {} };
    healthCheckService.check.mockImplementation(async (indicators: Array<() => Promise<unknown>>) => {
      await Promise.all(indicators.map((indicator) => indicator()));
      return report;
    });
    databaseIndicator.pingCheck.mockResolvedValue({});
    redisHealthService.check.mockResolvedValue({});

    await expect(service.checkReadiness()).resolves.toBe(report);

    expect(databaseIndicator.pingCheck).toHaveBeenCalledWith(HEALTH_CHECK.DATABASE_KEY, {
      timeout: HEALTH_CHECK.DATABASE_TIMEOUT_MS,
    });
    expect(redisHealthService.check).toHaveBeenCalledWith(HEALTH_CHECK.REDIS_KEY);
  });

  it("fails readiness when the database check fails", async () => {
    healthCheckService.check.mockImplementation(async (indicators: Array<() => Promise<unknown>>) => {
      await Promise.all(indicators.map((indicator) => indicator()));
      return {};
    });
    databaseIndicator.pingCheck.mockRejectedValue(new Error("db down"));
    redisHealthService.check.mockResolvedValue({});

    await expect(service.checkReadiness()).rejects.toThrow("db down");
  });
});
