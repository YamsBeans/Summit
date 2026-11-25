import { bestOneRepMax, estimateOneRepMax } from "../utils/oneRepMax";

describe("estimateOneRepMax", () => {
  it("returns the weight itself for a single", () => {
    expect(estimateOneRepMax(315, 1)).toBe(315);
  });
  it("applies the Epley formula", () => {
    expect(estimateOneRepMax(225, 5)).toBe(262.5);
    expect(estimateOneRepMax(100, 10)).toBe(133.3);
  });
  it("ignores missing, zero and very high-rep sets", () => {
    expect(estimateOneRepMax(null, 5)).toBeNull();
    expect(estimateOneRepMax(100, null)).toBeNull();
    expect(estimateOneRepMax(0, 5)).toBeNull();
    expect(estimateOneRepMax(100, 0)).toBeNull();
    expect(estimateOneRepMax(100, 20)).toBeNull();
  });
});

describe("bestOneRepMax", () => {
  it("picks the best working set and skips warmups", () => {
    expect(
      bestOneRepMax([
        { weight: 300, reps: 3, is_warmup: true },
        { weight: 225, reps: 5 },
        { weight: 185, reps: 10 },
      ])
    ).toBe(262.5);
  });
  it("returns null when nothing qualifies", () => {
    expect(bestOneRepMax([])).toBeNull();
    expect(bestOneRepMax([{ weight: null, reps: 8 }])).toBeNull();
  });
});
