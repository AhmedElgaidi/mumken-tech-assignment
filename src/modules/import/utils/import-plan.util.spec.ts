import { ImportPlanUtil } from "./import-plan.util";
import { RecordValidationHelper } from "../helpers/record-validation.helper";

const item = (externalId: string, source = "gov-news"): unknown => ({
  externalId,
  source,
  title: "t",
  description: "d",
  date: "2026-10-25",
});

describe("in-batch duplicate detection [R3]", () => {
  it("marks later occurrences of the same key, case- and space-insensitive on source", () => {
    const plan = ImportPlanUtil.planImport(
      [item("a"), item("a", " GOV-News "), item("b"), item("a", "other-source")].map((value) =>
        RecordValidationHelper.validate(value),
      ),
    );
    expect(plan.items.map((i) => [i.outcome, i.duplicateOfIndex])).toEqual([
      [null, null],
      ["DUPLICATE_IN_BATCH", 0],
      [null, null],
      [null, null],
    ]);
    expect(plan.candidates.map((c) => c.index)).toHaveLength(3);
  });

  it("keeps external ids case-sensitive", () => {
    const plan = ImportPlanUtil.planImport(
      [item("A"), item("a")].map((value) => RecordValidationHelper.validate(value)),
    );
    expect(plan.candidates).toHaveLength(2);
  });

  it("ignores invalid items for duplicate detection", () => {
    const plan = ImportPlanUtil.planImport(
      [{ externalId: "a" }, item("a")].map((value) => RecordValidationHelper.validate(value)),
    );
    expect(plan.items.map((i) => i.outcome)).toEqual(["INVALID", null]);
  });

  it("sorts candidates by key so concurrent imports lock rows in one order", () => {
    const plan = ImportPlanUtil.planImport(
      [item("c"), item("a", "z"), item("b")].map((value) => RecordValidationHelper.validate(value)),
    );
    expect(plan.candidates.map((c) => `${c.record.sourceKey}/${c.record.externalId}`)).toEqual([
      "gov-news/b",
      "gov-news/c",
      "z/a",
    ]);
  });
});
