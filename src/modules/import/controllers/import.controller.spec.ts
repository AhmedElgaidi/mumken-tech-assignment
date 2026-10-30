import { HttpStatus } from "@nestjs/common";
import { HTTP_CODE_METADATA } from "@nestjs/common/constants";
import { ServiceResultUtil } from "../../../infrastructure/utils/http/service-result.util";
import { CreateImportDto } from "../contracts/dtos/create-import.dto";
import { ListImportItemQueryDto } from "../contracts/dtos/list-import-item-query.dto";
import { ImportService } from "../services/import.service";
import { ImportController } from "./import.controller";

describe("ImportController", () => {
  const importId = "5b0f3c7e-8f3a-4f0e-9a5b-0d2f6a3c1e11";
  let importService: { submit: jest.Mock; get: jest.Mock; listItems: jest.Mock };
  let controller: ImportController;

  beforeEach(() => {
    importService = { submit: jest.fn(), get: jest.fn(), listItems: jest.fn() };
    controller = new ImportController(importService as unknown as ImportService);
  });

  it("submitImport passes the records, key and request id to the service and returns its result", async () => {
    const records = [{ externalId: "a" }, { externalId: "b" }];
    const result = ServiceResultUtil.of({ id: importId }, { isReplayed: true });
    importService.submit.mockResolvedValue(result);

    const returned = await controller.submitImport({ records } as unknown as CreateImportDto, "req-1", "key-1");

    expect(importService.submit).toHaveBeenCalledWith(records, "key-1", "req-1");
    expect(returned).toBe(result);
  });

  it("submitImport passes an absent key and request id through as undefined", async () => {
    importService.submit.mockResolvedValue(ServiceResultUtil.of({}));

    await controller.submitImport({ records: [] } as unknown as CreateImportDto, undefined);

    expect(importService.submit).toHaveBeenCalledWith([], undefined, undefined);
  });

  it("submitImport answers 202 Accepted", () => {
    const status: unknown = Reflect.getMetadata(HTTP_CODE_METADATA, ImportController.prototype.submitImport);
    expect(status).toBe(HttpStatus.ACCEPTED);
  });

  it("getImport returns the service's detail for the id", async () => {
    const detail = { id: importId };
    importService.get.mockResolvedValue(detail);

    await expect(controller.getImport(importId)).resolves.toBe(detail);
    expect(importService.get).toHaveBeenCalledWith(importId);
  });

  it("listImportItems passes the id and the query unchanged and returns the page", async () => {
    const query = { outcome: "INVALID", cursor: "c", limit: 5 } as ListImportItemQueryDto;
    const page = { data: [], nextCursor: null };
    importService.listItems.mockResolvedValue(page);

    await expect(controller.listImportItems(importId, query)).resolves.toBe(page);
    expect(importService.listItems).toHaveBeenCalledWith(importId, query);
  });

  it("propagates a service failure", async () => {
    const failure = new Error("boom");
    importService.get.mockRejectedValue(failure);

    await expect(controller.getImport(importId)).rejects.toBe(failure);
  });
});
