import { DEFAULT_APP_SETTINGS } from "../../../infrastructure/constants/settings/app-settings.constant";
import { AppConfigService } from "../../../infrastructure/services/env/app-config.service";
import { SweepReportInterface } from "../contracts/interfaces/worker/sweep-report.interface";
import { SweeperService } from "../services/sweeper.service";
import { MaintenanceProcessor } from "./maintenance.processor";

describe("MaintenanceProcessor", () => {
  const report: SweepReportInterface = { scanned: 3, requeued: 2, alreadyQueued: 1, exhausted: 0, skippedActive: 0 };

  it("runs one sweeper pass and returns its report", async () => {
    const sweep = jest.fn().mockResolvedValue(report);
    const processor = new MaintenanceProcessor(
      { sweep } as unknown as SweeperService,
      {} as AppConfigService,
      DEFAULT_APP_SETTINGS,
    );
    await expect(processor.process()).resolves.toBe(report);
    expect(sweep).toHaveBeenCalledTimes(1);
  });

  it("propagates a sweeper failure so BullMQ records it", async () => {
    const sweep = jest.fn().mockRejectedValue(new Error("db down"));
    const processor = new MaintenanceProcessor(
      { sweep } as unknown as SweeperService,
      {} as AppConfigService,
      DEFAULT_APP_SETTINGS,
    );
    await expect(processor.process()).rejects.toThrow("db down");
  });
});
