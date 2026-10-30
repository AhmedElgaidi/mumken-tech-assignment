import { ImportCountUtil } from "../../../infrastructure/utils/sql-db/import-count.util";
import { ImportStatusUtil } from "./import-status.util";

const createdAt = new Date("2026-10-30T10:00:00Z");
const finishedAt = new Date("2026-10-30T10:05:00Z");

function derive(
  items: Partial<ReturnType<typeof ImportCountUtil.createEmptyItemCounts>>,
  records: Partial<ReturnType<typeof ImportCountUtil.createEmptyRecordCounts>>,
) {
  return ImportStatusUtil.derive({
    items: { ...ImportCountUtil.createEmptyItemCounts(), ...items },
    records: { ...ImportCountUtil.createEmptyRecordCounts(), ...records },
    latestFinishedAt: finishedAt,
    createdAt,
  });
}

describe("import status truth table [R4]", () => {
  it("all items invalid → COMPLETED_WITH_ISSUES at once, 100%", () => {
    expect(derive({ INVALID: 3 }, {})).toEqual({
      status: "COMPLETED_WITH_ISSUES",
      completedAt: createdAt,
      progress: { finished: 0, of: 0, percent: 100 },
    });
  });

  it("all items duplicates → COMPLETED (duplicates are not issues)", () => {
    expect(derive({ DUPLICATE_EXISTING: 2, DUPLICATE_IN_BATCH: 1 }, {}).status).toBe("COMPLETED");
  });

  it("any record pending or processing → PROCESSING with no completedAt", () => {
    expect(derive({ ACCEPTED: 3, INVALID: 1 }, { CLASSIFIED: 1, PROCESSING: 1, FAILED: 1 })).toEqual({
      status: "PROCESSING",
      completedAt: null,
      progress: { finished: 2, of: 3, percent: 66 },
    });
  });

  it("a record in review or failed → COMPLETED_WITH_ISSUES", () => {
    expect(derive({ ACCEPTED: 2 }, { CLASSIFIED: 1, NEEDS_REVIEW: 1 }).status).toBe("COMPLETED_WITH_ISSUES");
    expect(derive({ ACCEPTED: 2 }, { CLASSIFIED: 1, FAILED: 1 }).status).toBe("COMPLETED_WITH_ISSUES");
  });

  it("last review approved → COMPLETED; a retry moves it back to PROCESSING", () => {
    expect(derive({ ACCEPTED: 2, DUPLICATE_EXISTING: 1 }, { CLASSIFIED: 2 })).toMatchObject({
      status: "COMPLETED",
      completedAt: finishedAt,
    });
    expect(derive({ ACCEPTED: 2 }, { CLASSIFIED: 1, PENDING: 1 }).status).toBe("PROCESSING");
  });
});
