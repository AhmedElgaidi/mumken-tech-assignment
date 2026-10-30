import { HttpStatus } from "@nestjs/common";
import { ErrorCodeEnum } from "../../../infrastructure/contracts/enums/http/error-code.enum";
import { ClassificationAttemptRowInterface } from "../../../infrastructure/contracts/interfaces/sql-db/classification/classification-attempt-row.interface";
import { ClassificationRowInterface } from "../../../infrastructure/contracts/interfaces/sql-db/classification/classification-row.interface";
import {
  RecordFilterInterface,
  RecordRowInterface,
} from "../../../infrastructure/contracts/interfaces/sql-db/record/record-row.interface";
import { ProblemException } from "../../../infrastructure/exceptions/http/problem.exception";
import { RecordRepository } from "../../../infrastructure/repositories/record/record.repository";
import { AttemptOutcomeEnum } from "../../classification/contracts/enums/lifecycle/attempt-outcome.enum";
import { ClassificationKindEnum } from "../../classification/contracts/enums/lifecycle/classification-kind.enum";
import { RecordStatusEnum } from "../../classification/contracts/enums/lifecycle/record-status.enum";
import { DEFAULT_RECORD_PAGE_SIZE } from "../constants/record-query.constant";
import { RecordService } from "./record.service";
import { RecordFilterService } from "./record-filter.service";

const ID_1 = "7b0f7c5e-0000-4000-8000-000000000001";
const ID_2 = "7b0f7c5e-0000-4000-8000-000000000002";
const ID_3 = "7b0f7c5e-0000-4000-8000-000000000003";
const CLASSIFICATION_AUTO = "7b0f7c5e-0000-4000-8000-0000000000a1";
const CLASSIFICATION_MANUAL = "7b0f7c5e-0000-4000-8000-0000000000a2";

function makeRow(id: string, overrides: Partial<RecordRowInterface> = {}): RecordRowInterface {
  return {
    id,
    externalId: `ext-${id.slice(-1)}`,
    source: "Gov",
    title: "Title",
    description: "Body",
    recordDate: new Date("2026-10-10T00:00:00.000Z"),
    classificationStatus: RecordStatusEnum.CLASSIFIED,
    failureKind: null,
    currentCategoryCode: "sports",
    currentClassificationId: CLASSIFICATION_AUTO,
    currentConfidence: "0.9",
    retryGeneration: 1,
    lastError: null,
    finishedAt: new Date("2026-10-11T00:00:00.000Z"),
    importId: ID_3,
    createdAt: new Date("2026-10-09T00:00:00.000Z"),
    ...overrides,
  };
}

function makeClassification(
  id: string,
  kind: ClassificationKindEnum,
  categoryCode: string,
  confidence: string | null,
): ClassificationRowInterface {
  return {
    id,
    recordId: ID_1,
    kind,
    categoryCode,
    confidence,
    isReviewNeeded: false,
    classifier: null,
    rawOutput: null,
    reason: null,
    reviewedBy: null,
    supersedesId: null,
    createdAt: new Date("2026-10-10T12:00:00.000Z"),
  };
}

describe("RecordService", () => {
  const recordRepository = {
    findPage: jest.fn(),
    findById: jest.fn(),
    findClassificationHistory: jest.fn(),
    findAttempts: jest.fn(),
  };
  const recordFilterService = { buildFilter: jest.fn() };
  let service: RecordService;

  beforeEach(() => {
    jest.resetAllMocks();
    recordFilterService.buildFilter.mockResolvedValue({});
    service = new RecordService(
      recordRepository as unknown as RecordRepository,
      recordFilterService as unknown as RecordFilterService,
    );
  });

  describe("listRecords", () => {
    it("builds the filter from the query and reads one extra row", async () => {
      const filter: RecordFilterInterface = { sourceKey: "gov" };
      recordFilterService.buildFilter.mockResolvedValue(filter);
      recordRepository.findPage.mockResolvedValue([]);
      const query = { source: "gov", limit: 2 };

      await service.listRecords(query);

      expect(recordFilterService.buildFilter).toHaveBeenCalledWith(query);
      expect(recordRepository.findPage).toHaveBeenCalledWith(filter, null, 3);
    });

    it("uses the default page size when no limit is sent", async () => {
      recordRepository.findPage.mockResolvedValue([]);

      await service.listRecords({});

      expect(recordRepository.findPage).toHaveBeenCalledWith({}, null, DEFAULT_RECORD_PAGE_SIZE + 1);
    });

    it("returns a next cursor when more rows follow the page", async () => {
      recordRepository.findPage.mockResolvedValue([makeRow(ID_1), makeRow(ID_2), makeRow(ID_3)]);

      const page = await service.listRecords({ limit: 2 });

      expect(page.data.map((item) => item.id)).toEqual([ID_1, ID_2]);
      expect(page.nextCursor).toEqual(expect.any(String));
    });

    it("returns a null cursor on a short or exactly full last page", async () => {
      recordRepository.findPage.mockResolvedValue([makeRow(ID_1), makeRow(ID_2)]);
      await expect(service.listRecords({ limit: 2 })).resolves.toMatchObject({ nextCursor: null });

      recordRepository.findPage.mockResolvedValue([makeRow(ID_1)]);
      await expect(service.listRecords({ limit: 2 })).resolves.toMatchObject({ nextCursor: null });
    });

    it("maps rows to list items", async () => {
      recordRepository.findPage.mockResolvedValue([makeRow(ID_1)]);

      const page = await service.listRecords({});

      expect(page.data[0]).toMatchObject({
        id: ID_1,
        date: "2026-10-10T00:00:00.000Z",
        category: "sports",
        confidence: 0.9,
      });
    });

    it("continues after the position carried by the cursor it issued", async () => {
      recordRepository.findPage.mockResolvedValue([makeRow(ID_1), makeRow(ID_2), makeRow(ID_3)]);
      const first = await service.listRecords({ limit: 2 });
      recordRepository.findPage.mockResolvedValue([]);

      await service.listRecords({ limit: 2, cursor: first.nextCursor ?? "" });

      expect(recordRepository.findPage).toHaveBeenLastCalledWith(
        {},
        { recordDate: new Date("2026-10-10T00:00:00.000Z"), id: ID_2 },
        3,
      );
    });

    it("rejects a cursor reused with different filters as INVALID_CURSOR", async () => {
      recordRepository.findPage.mockResolvedValue([makeRow(ID_1), makeRow(ID_2), makeRow(ID_3)]);
      const first = await service.listRecords({ limit: 2 });
      recordFilterService.buildFilter.mockResolvedValue({ sourceKey: "other" });

      const attempt = service.listRecords({ limit: 2, cursor: first.nextCursor ?? "" });

      await expect(attempt).rejects.toMatchObject({
        code: ErrorCodeEnum.INVALID_CURSOR,
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it("rejects a malformed cursor as INVALID_FILTER", async () => {
      const attempt = service.listRecords({ cursor: "%%%" });

      await expect(attempt).rejects.toMatchObject({
        code: ErrorCodeEnum.INVALID_FILTER,
        status: HttpStatus.BAD_REQUEST,
      });
      expect(recordRepository.findPage).not.toHaveBeenCalled();
    });

    it("rejects a cursor whose position is not a date and uuid as INVALID_FILTER", async () => {
      const cursor = Buffer.from(JSON.stringify({ recordDate: "nope", id: "x", filterHash: "h" })).toString(
        "base64url",
      );

      await expect(service.listRecords({ cursor })).rejects.toMatchObject({ code: ErrorCodeEnum.INVALID_FILTER });
    });

    it("propagates an invalid filter", async () => {
      recordFilterService.buildFilter.mockRejectedValue(
        new ProblemException(HttpStatus.BAD_REQUEST, ErrorCodeEnum.INVALID_FILTER, "bad"),
      );

      await expect(service.listRecords({ status: "x" })).rejects.toMatchObject({ code: ErrorCodeEnum.INVALID_FILTER });
    });
  });

  describe("getRecordDetail", () => {
    it("throws NOT_FOUND for an unknown id", async () => {
      recordRepository.findById.mockResolvedValue(null);

      await expect(service.getRecordDetail(ID_1)).rejects.toMatchObject({
        code: ErrorCodeEnum.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
      expect(recordRepository.findClassificationHistory).not.toHaveBeenCalled();
      expect(recordRepository.findAttempts).not.toHaveBeenCalled();
    });

    it("assembles current and original classification, history and attempts", async () => {
      const row = makeRow(ID_1, {
        currentClassificationId: CLASSIFICATION_MANUAL,
        retryGeneration: 2,
        lastError: "boom",
      });
      const history = [
        makeClassification(CLASSIFICATION_AUTO, ClassificationKindEnum.AUTOMATIC, "sports", "0.4"),
        makeClassification(CLASSIFICATION_MANUAL, ClassificationKindEnum.MANUAL_CORRECTION, "politics", null),
      ];
      const attempts: ClassificationAttemptRowInterface[] = [
        {
          retryGeneration: 1,
          attemptNo: 1,
          outcome: AttemptOutcomeEnum.TRANSIENT_ERROR,
          error: "e",
          durationMs: 10,
          createdAt: new Date("2026-10-10T01:00:00.000Z"),
        },
        {
          retryGeneration: 2,
          attemptNo: 1,
          outcome: AttemptOutcomeEnum.SUCCEEDED,
          error: null,
          durationMs: 20,
          createdAt: new Date("2026-10-10T02:00:00.000Z"),
        },
      ];
      recordRepository.findById.mockResolvedValue(row);
      recordRepository.findClassificationHistory.mockResolvedValue(history);
      recordRepository.findAttempts.mockResolvedValue(attempts);

      const detail = await service.getRecordDetail(ID_1);

      expect(detail.classification).toMatchObject({
        id: CLASSIFICATION_MANUAL,
        categoryCode: "politics",
        confidence: null,
      });
      expect(detail.originalClassification).toMatchObject({ id: CLASSIFICATION_AUTO, confidence: 0.4 });
      expect(detail.history.map((view) => view.id)).toEqual([CLASSIFICATION_AUTO, CLASSIFICATION_MANUAL]);
      expect(detail.attempts).toMatchObject({ total: 2, currentGeneration: 1, lastError: "boom" });
      expect(detail.attempts.items[1]).toMatchObject({
        attemptNo: 1,
        outcome: AttemptOutcomeEnum.SUCCEEDED,
        createdAt: "2026-10-10T02:00:00.000Z",
      });
      expect(detail).toMatchObject({ id: ID_1, description: "Body", retryGeneration: 2 });
    });

    it("returns null classifications and an ISO finishedAt or null for an unclassified record", async () => {
      recordRepository.findById.mockResolvedValue(
        makeRow(ID_1, {
          currentClassificationId: null,
          finishedAt: null,
          classificationStatus: RecordStatusEnum.PENDING,
        }),
      );
      recordRepository.findClassificationHistory.mockResolvedValue([]);
      recordRepository.findAttempts.mockResolvedValue([]);

      const detail = await service.getRecordDetail(ID_1);

      expect(detail).toMatchObject({
        classification: null,
        originalClassification: null,
        finishedAt: null,
        history: [],
      });
      expect(detail.attempts).toMatchObject({ total: 0, currentGeneration: 0, items: [] });
    });

    it("reads inside the given transaction", async () => {
      const transaction = {} as never;
      recordRepository.findById.mockResolvedValue(makeRow(ID_1));
      recordRepository.findClassificationHistory.mockResolvedValue([]);
      recordRepository.findAttempts.mockResolvedValue([]);

      await service.getRecordDetail(ID_1, transaction);

      expect(recordRepository.findById).toHaveBeenCalledWith(ID_1, transaction);
      expect(recordRepository.findClassificationHistory).toHaveBeenCalledWith(ID_1, transaction);
      expect(recordRepository.findAttempts).toHaveBeenCalledWith(ID_1, transaction);
    });
  });
});
