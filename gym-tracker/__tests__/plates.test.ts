import { calculatePlates, groupPlates, PLATES } from "@/utils/plates";

describe("calculatePlates", () => {
  it("loads lbs plates heaviest first", () => {
    const r = calculatePlates(225, 45, PLATES.lbs);
    expect(r.perSide).toEqual([45, 45]);
    expect(r.loaded).toBe(225);
    expect(r.remainder).toBe(0);
    expect(calculatePlates(185, 45, PLATES.lbs).perSide).toEqual([45, 25]);
    expect(calculatePlates(150, 45, PLATES.lbs).perSide).toEqual([45, 5, 2.5]);
  });

  it("handles kg including 1.25s", () => {
    expect(calculatePlates(100, 20, PLATES.kg).perSide).toEqual([25, 15]);
    expect(calculatePlates(62.5, 20, PLATES.kg).perSide).toEqual([20, 1.25]);
  });

  it("reports what it can't make exactly", () => {
    const r = calculatePlates(136, 45, PLATES.lbs);
    expect(r.perSide).toEqual([45]);
    expect(r.loaded).toBe(135);
    expect(r.remainder).toBe(1);
  });

  it("returns just the bar at or below bar weight", () => {
    expect(calculatePlates(45, 45, PLATES.lbs)).toEqual({ perSide: [], loaded: 45, remainder: 0 });
    expect(calculatePlates(30, 45, PLATES.lbs).perSide).toEqual([]);
  });
});

describe("groupPlates", () => {
  it("groups runs of the same plate", () => {
    expect(groupPlates([45, 45, 10, 2.5])).toEqual([[45, 2], [10, 1], [2.5, 1]]);
    expect(groupPlates([])).toEqual([]);
  });
});
