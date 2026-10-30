import { HashHelper } from "./hash.helper";

describe("HashHelper", () => {
  it("hashes text with SHA-256 as hex", () => {
    expect(HashHelper.sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("gives equal hashes for equal data in any key order", () => {
    expect(HashHelper.hashJson({ a: 1, b: { c: 2, d: 3 } })).toBe(HashHelper.hashJson({ b: { d: 3, c: 2 }, a: 1 }));
  });

  it("gives different hashes when array order differs", () => {
    expect(HashHelper.hashJson([1, 2])).not.toBe(HashHelper.hashJson([2, 1]));
  });
});
