import { niceAxisMax } from "@/utils/chartScale";

describe("niceAxisMax", () => {
  it("gives whole-number steps for small values", () => {
    expect(niceAxisMax(0)).toBe(4);
    expect(niceAxisMax(1)).toBe(4);
    expect(niceAxisMax(3)).toBe(4);
    expect(niceAxisMax(5)).toBe(8);
  });

  it("rounds larger values up to a tidy max", () => {
    expect(niceAxisMax(87)).toBe(100);
    expect(niceAxisMax(100)).toBe(100);
    expect(niceAxisMax(101)).toBe(200);
    expect(niceAxisMax(12345)).toBe(20000);
    expect(niceAxisMax(9100)).toBe(10000);
  });

  it("never returns less than the input", () => {
    for (const v of [1, 7, 13, 42, 99, 250, 999, 1001, 31337]) {
      expect(niceAxisMax(v)).toBeGreaterThanOrEqual(v);
      expect(Number.isInteger(niceAxisMax(v) / 4)).toBe(true);
    }
  });
});
