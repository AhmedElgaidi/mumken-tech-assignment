import { RecordController } from "./record.controller";
import { RecordService } from "../services/record.service";
import { ListRecordQueryDto } from "../contracts/dtos/list-record-query.dto";
import { RecordDetailInterface } from "../contracts/interfaces/record-detail.interface";

describe("RecordController", () => {
  const recordService = { listRecords: jest.fn(), getRecordDetail: jest.fn() };
  const controller = new RecordController(recordService as unknown as RecordService);

  beforeEach(() => jest.resetAllMocks());

  it("passes the list query unchanged and returns the page", async () => {
    const query: ListRecordQueryDto = { source: "gov", limit: 5 };
    const page = { data: [], nextCursor: null };
    recordService.listRecords.mockResolvedValue(page);

    await expect(controller.listRecords(query)).resolves.toBe(page);
    expect(recordService.listRecords).toHaveBeenCalledWith(query);
  });

  it("passes the id unchanged and returns the detail", async () => {
    const detail = { id: "a" } as RecordDetailInterface;
    recordService.getRecordDetail.mockResolvedValue(detail);

    await expect(controller.getRecord("7b0f7c5e-0000-4000-8000-000000000001")).resolves.toBe(detail);
    expect(recordService.getRecordDetail).toHaveBeenCalledWith("7b0f7c5e-0000-4000-8000-000000000001");
  });
});
