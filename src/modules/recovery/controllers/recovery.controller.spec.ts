import { RecordDetailInterface } from "../../record/contracts/interfaces/record-detail.interface";
import { RetryDto } from "../contracts/dtos/retry.dto";
import { ImportRetryResultInterface } from "../contracts/interfaces/import-retry-result.interface";
import { RecoveryService } from "../services/recovery.service";
import { RecoveryController } from "./recovery.controller";

describe("RecoveryController", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  let recoveryService: { retryImport: jest.Mock; retryRecord: jest.Mock };
  let controller: RecoveryController;

  beforeEach(() => {
    recoveryService = { retryImport: jest.fn(), retryRecord: jest.fn() };
    controller = new RecoveryController(recoveryService as unknown as RecoveryService);
  });

  it("delegates an import retry unchanged and returns the service value", async () => {
    const body: RetryDto = { isForced: true };
    const result: ImportRetryResultInterface = {
      requeued: 2,
      skipped: { permanent: 0, classified: 1, needsReview: 0, inProgress: 0 },
    };
    recoveryService.retryImport.mockResolvedValue(result);

    await expect(controller.retryImport(id, body, "req-1")).resolves.toBe(result);
    expect(recoveryService.retryImport).toHaveBeenCalledWith(id, body, "req-1");
  });

  it("delegates a record retry unchanged and returns the service value", async () => {
    const body = new RetryDto();
    const record = { id } as RecordDetailInterface;
    recoveryService.retryRecord.mockResolvedValue(record);

    await expect(controller.retryRecord(id, body, undefined)).resolves.toBe(record);
    expect(recoveryService.retryRecord).toHaveBeenCalledWith(id, body, undefined);
  });

  it("propagates service errors", async () => {
    const error = new Error("boom");
    recoveryService.retryRecord.mockRejectedValue(error);

    await expect(controller.retryRecord(id, new RetryDto(), "req")).rejects.toBe(error);
  });
});
