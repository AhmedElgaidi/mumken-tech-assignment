import { HealthStatusEnum } from "../contracts/enums/health-status.enum";
import { HealthService } from "../services/health.service";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  const healthService = { checkLiveness: jest.fn(), checkReadiness: jest.fn() };
  const controller = new HealthController(healthService as unknown as HealthService);

  beforeEach(() => jest.resetAllMocks());

  it("returns the liveness result", () => {
    const result = { status: HealthStatusEnum.OK };
    healthService.checkLiveness.mockReturnValue(result);

    expect(controller.checkLiveness()).toBe(result);
  });

  it("returns the readiness result", async () => {
    const result = { status: "ok", info: {}, error: {}, details: {} };
    healthService.checkReadiness.mockResolvedValue(result);

    await expect(controller.checkReadiness()).resolves.toBe(result);
  });
});
