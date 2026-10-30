import { Test } from "@nestjs/testing";
import { ErrorCodeEnum } from "../../../infrastructure/contracts/enums/http/error-code.enum";
import { ProblemException } from "../../../infrastructure/exceptions/http/problem.exception";
import { CategoryService } from "../../category/services/category.service";
import { RecordStatusEnum } from "../../classification/contracts/enums/lifecycle/record-status.enum";
import { RecordFilterService } from "./record-filter.service";

describe("RecordFilterService", () => {
  const categoryService = { getCodes: jest.fn() };
  let service: RecordFilterService;

  beforeEach(async () => {
    jest.resetAllMocks();
    categoryService.getCodes.mockResolvedValue(new Set(["sports", "politics"]));
    const moduleRef = await Test.createTestingModule({
      providers: [RecordFilterService, { provide: CategoryService, useValue: categoryService }],
    }).compile();
    service = moduleRef.get(RecordFilterService);
  });

  async function codeOf(promise: Promise<unknown>): Promise<ErrorCodeEnum | undefined> {
    try {
      await promise;
    } catch (error) {
      return (error as ProblemException).code;
    }
    return undefined;
  }

  it("returns an empty filter for an empty query", async () => {
    await expect(service.buildFilter({})).resolves.toEqual({});
    expect(categoryService.getCodes).not.toHaveBeenCalled();
  });

  it("builds every filter part", async () => {
    const filter = await service.buildFilter({
      source: "  Gov-News ",
      importId: "7b0f7c5e-0000-4000-8000-000000000001",
      category: " Sports ",
      status: "needs_review, failed",
      dateFrom: "2026-10-01",
      dateTo: "2026-10-05",
      q: "50%_off",
    });

    expect(filter).toEqual({
      sourceKey: "gov-news",
      importId: "7b0f7c5e-0000-4000-8000-000000000001",
      category: "sports",
      statuses: [RecordStatusEnum.NEEDS_REVIEW, RecordStatusEnum.FAILED],
      dateFrom: new Date("2026-10-01T00:00:00.000Z"),
      dateToExclusive: new Date("2026-10-06T00:00:00.000Z"),
      titleLike: "%50\\%\\_off%",
    });
  });

  it("uses an inclusive upper bound for a date-time", async () => {
    const filter = await service.buildFilter({ dateTo: "2026-10-05T10:00:00Z" });

    expect(filter).toEqual({ dateToInclusive: new Date("2026-10-05T10:00:00.000Z") });
  });

  it("ignores a blank title search", async () => {
    await expect(service.buildFilter({ q: "   " })).resolves.toEqual({});
  });

  it("rejects an unknown category", async () => {
    await expect(codeOf(service.buildFilter({ category: "cooking" }))).resolves.toBe(ErrorCodeEnum.INVALID_FILTER);
  });

  it("rejects an unknown status", async () => {
    await expect(codeOf(service.buildFilter({ status: "DONE" }))).resolves.toBe(ErrorCodeEnum.INVALID_FILTER);
  });

  it("rejects a bad date and a reversed range", async () => {
    await expect(codeOf(service.buildFilter({ dateFrom: "yesterday" }))).resolves.toBe(ErrorCodeEnum.INVALID_FILTER);
    await expect(codeOf(service.buildFilter({ dateFrom: "2026-10-05", dateTo: "2026-10-01" }))).resolves.toBe(
      ErrorCodeEnum.INVALID_FILTER,
    );
  });

  it("reports the first bad filter in validation order", async () => {
    await expect(service.buildFilter({ category: "cooking", status: "DONE" })).rejects.toThrow(/Unknown category/);
  });
});
