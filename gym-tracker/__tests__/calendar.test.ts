import { monthGrid, shiftMonth, toDateKey } from "../utils/calendar";

describe("monthGrid", () => {
  it("lays out November 2026 starting on a Sunday", () => {
    const g = monthGrid(2026, 10);
    expect(g[0][0]).toBe("2026-11-01");
    expect(g.flat().filter(Boolean)).toHaveLength(30);
    expect(g.every((w) => w.length === 7)).toBe(true);
  });

  it("pads the first week for a month starting mid-week", () => {
    const g = monthGrid(2026, 9); // Oct 1 2026 is a Thursday
    expect(g[0].slice(0, 4)).toEqual([null, null, null, null]);
    expect(g[0][4]).toBe("2026-10-01");
  });

  it("handles leap years", () => {
    expect(monthGrid(2028, 1).flat().filter(Boolean)).toHaveLength(29);
  });
});

it("shifts months across years", () => {
  expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
});

it("formats local dates", () => {
  expect(toDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
});
