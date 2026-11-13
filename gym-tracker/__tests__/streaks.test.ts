jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));

import { weekStartOf, weeklyStreaks, workoutsThisWeek } from "@/utils/streaks";

// Mon 9 Nov 2026
const today = new Date(2026, 10, 9, 18, 30);

describe("weekStartOf", () => {
  it("returns the Sunday of the week", () => {
    expect(weekStartOf("2026-11-09")).toBe("2026-11-08");
    expect(weekStartOf("2026-11-08")).toBe("2026-11-08");
    expect(weekStartOf("2026-11-14")).toBe("2026-11-08");
    expect(weekStartOf(today)).toBe("2026-11-08");
    // Across the US DST change (1 Nov 2026)
    expect(weekStartOf("2026-11-03")).toBe("2026-11-01");
  });
});

describe("weeklyStreaks", () => {
  it("counts a Mon/Wed/Fri lifter's weeks, not days", () => {
    const dates = ["2026-10-19", "2026-10-21", "2026-10-23", "2026-10-26", "2026-10-30", "2026-11-02", "2026-11-04", "2026-11-09"];
    expect(weeklyStreaks(dates, today)).toEqual({ current: 4, longest: 4 });
  });

  it("keeps the streak alive while this week has no workout yet", () => {
    expect(weeklyStreaks(["2026-10-26", "2026-11-02"], today)).toEqual({ current: 2, longest: 2 });
  });

  it("breaks after a full week off and keeps the longest run", () => {
    const dates = ["2026-09-01", "2026-09-08", "2026-09-15", "2026-10-26"];
    expect(weeklyStreaks(dates, today)).toEqual({ current: 0, longest: 3 });
    expect(weeklyStreaks([], today)).toEqual({ current: 0, longest: 0 });
  });

  it("joins weeks across a year boundary", () => {
    expect(weeklyStreaks(["2026-12-29", "2027-01-04"], new Date(2027, 0, 5))).toEqual({ current: 2, longest: 2 });
  });
});

it("counts workouts in this week, including two on one day", () => {
  expect(workoutsThisWeek(["2026-11-08", "2026-11-09", "2026-11-09", "2026-11-07"], today)).toBe(3);
});
