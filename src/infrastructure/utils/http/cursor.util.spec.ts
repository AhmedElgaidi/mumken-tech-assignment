import { CursorUtil } from "./cursor.util";

describe("cursor encoding", () => {
  it("round-trips", () => {
    const payload = { recordDate: "2026-10-25T00:00:00.000Z", id: "abc", filterHash: "f" };
    expect(CursorUtil.decode(CursorUtil.encode(payload))).toEqual(payload);
  });

  it("returns null for anything malformed", () => {
    expect(CursorUtil.decode("%%%")).toBeNull();
    expect(CursorUtil.decode(Buffer.from("[1,2]").toString("base64url"))).toBeNull();
    expect(CursorUtil.decode(Buffer.from('"x"').toString("base64url"))).toBeNull();
  });
});
