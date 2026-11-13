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

import { niceAxisRange } from "@/utils/chartScale";

describe("niceAxisRange", () => {
  it("zooms in on a narrow band far from zero", () => {
    const { offset, span } = niceAxisRange([185, 205]);
    expect(offset).toBeGreaterThan(100);
    expect(offset).toBeLessThanOrEqual(185);
    expect(offset + span).toBeGreaterThanOrEqual(205);
    expect(Number.isInteger(span / 4)).toBe(true);
  });

  it("keeps zero for wide ranges and empty data", () => {
    expect(niceAxisRange([20, 200]).offset).toBe(0);
    expect(niceAxisRange([]).offset).toBe(0);
    expect(niceAxisRange([0, 5]).offset).toBe(0);
  });

  it("always contains every value", () => {
    for (const vals of [[1, 1], [99, 101], [500, 510, 530], [1234, 1300], [45.5, 47.5], [10000, 10500]]) {
      const { offset, span } = niceAxisRange(vals);
      expect(offset).toBeLessThanOrEqual(Math.min(...vals));
      expect(offset + span).toBeGreaterThanOrEqual(Math.max(...vals));
    }
  });
});
