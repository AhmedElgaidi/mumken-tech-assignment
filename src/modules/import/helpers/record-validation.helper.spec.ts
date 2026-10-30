import { RecordIdentityUtil } from "../utils/record-identity.util";
import { RecordDateUtil } from "../utils/record-date.util";
import { RecordValidationHelper } from "./record-validation.helper";

const valid = {
  externalId: "a-1",
  title: "Title",
  description: "Text",
  source: "gov-news",
  date: "2026-10-25",
};

function errorsOf(raw: unknown): Array<{ field: string; code: string }> {
  const result = RecordValidationHelper.validate(raw);
  return result.isValid ? [] : result.errors.map(({ field, code }) => ({ field, code }));
}

describe("per-record validation [R2]", () => {
  it("accepts a valid record and normalises it", () => {
    const result = RecordValidationHelper.validate({
      ...valid,
      source: "  Gov-News ",
      title: "  Title  ",
    });
    expect(result.isValid).toBe(true);
    if (result.isValid) {
      expect(result.record).toMatchObject({
        source: "Gov-News",
        sourceKey: "gov-news",
        title: "Title",
      });
      expect(result.record.recordDate.toISOString()).toBe("2026-10-25T00:00:00.000Z");
    }
  });

  it("reports every invalid field of one item at once", () => {
    expect(errorsOf({ title: 5, description: "   ", source: "x".repeat(101), date: "2026-02-30" })).toEqual([
      { field: "externalId", code: "REQUIRED" },
      { field: "title", code: "INVALID_TYPE" },
      { field: "description", code: "EMPTY" },
      { field: "source", code: "TOO_LONG" },
      { field: "date", code: "INVALID_DATE" },
    ]);
  });

  it.each([
    [{ externalId: null }, "externalId", "REQUIRED"],
    [{ externalId: "a\tb" }, "externalId", "INVALID_FORMAT"],
    [{ externalId: "x".repeat(256) }, "externalId", "TOO_LONG"],
    [{ title: "x".repeat(501) }, "title", "TOO_LONG"],
    [{ description: "x".repeat(5001) }, "description", "TOO_LONG"],
    [{ date: "2026-10-25T09:00:00" }, "date", "INVALID_DATE"],
    [{ date: "25/10/2026" }, "date", "INVALID_DATE"],
    [{ date: 20261025 }, "date", "INVALID_TYPE"],
    [{ date: "1899-12-31" }, "date", "OUT_OF_RANGE"],
    [{ date: "2099-01-01" }, "date", "OUT_OF_RANGE"],
  ])("rejects %j with %s %s", (override, field, code) => {
    expect(errorsOf({ ...valid, ...override })).toEqual([{ field, code }]);
  });

  it("flags non-object items", () => {
    expect(errorsOf("nope")).toEqual([{ field: "item", code: "INVALID_ITEM" }]);
    expect(errorsOf([valid])).toEqual([{ field: "item", code: "INVALID_ITEM" }]);
  });

  it("ignores unknown fields and reports them as warnings", () => {
    const result = RecordValidationHelper.validate({ ...valid, author: "x", tags: [] });
    expect(result.isValid).toBe(true);
    expect(result.warnings).toEqual([
      { code: "UNKNOWN_FIELD_IGNORED", field: "author" },
      { code: "UNKNOWN_FIELD_IGNORED", field: "tags" },
    ]);
  });

  it("gives every message a hint on how to fix it", () => {
    const result = RecordValidationHelper.validate({ ...valid, date: "tomorrow" });
    expect(result.isValid).toBe(false);
    if (!result.isValid) {
      expect(result.errors[0]?.message).toContain("2026-10-25");
    }
  });
});

describe("record dates", () => {
  const now = new Date("2026-10-30T00:00:00Z");

  it("accepts date-only and date-time with offset, stored in UTC", () => {
    expect(RecordDateUtil.parse("2026-10-25", now)).toEqual({
      isOk: true,
      value: new Date("2026-10-25T00:00:00Z"),
    });
    expect(RecordDateUtil.parse("2026-10-25T09:00:00+03:00", now)).toEqual({
      isOk: true,
      value: new Date("2026-10-25T06:00:00Z"),
    });
    expect(RecordDateUtil.parse("2026-10-25T09:00Z", now).isOk).toBe(true);
  });

  it("rejects impossible calendar dates instead of rolling them over", () => {
    expect(RecordDateUtil.parse("2026-02-30", now)).toEqual({ isOk: false, code: "INVALID_DATE" });
    expect(RecordDateUtil.parse("2026-13-01", now)).toEqual({ isOk: false, code: "INVALID_DATE" });
    expect(RecordDateUtil.parse("2028-02-29", now).isOk).toBe(true);
    expect(RecordDateUtil.parse("2026-10-25T24:00:00Z", now)).toEqual({
      isOk: false,
      code: "INVALID_DATE",
    });
  });

  it("allows future effective dates up to five years", () => {
    expect(RecordDateUtil.parse("2031-10-29", now).isOk).toBe(true);
    expect(RecordDateUtil.parse("2031-10-31", now)).toEqual({ isOk: false, code: "OUT_OF_RANGE" });
  });
});

describe("content hash", () => {
  it("treats a date-only value and the same instant as equal", () => {
    expect(RecordIdentityUtil.getContentHash("t", "d", new Date("2026-10-25"))).toBe(
      RecordIdentityUtil.getContentHash("t", "d", new Date("2026-10-25T00:00:00Z")),
    );
    expect(RecordIdentityUtil.getContentHash("t", "d", new Date("2026-10-25"))).not.toBe(
      RecordIdentityUtil.getContentHash("t2", "d", new Date("2026-10-25")),
    );
  });
});
