import { formatLastDone, lastDoneByRoutine } from "@/utils/lastDone";

describe("lastDoneByRoutine", () => {
  it("keeps the latest finished date per routine", () => {
    expect(lastDoneByRoutine([
      { routine_id: 1, session_date: "2026-11-01", end_time: "10:00:00" },
      { routine_id: 1, session_date: "2026-11-04", end_time: "10:00:00" },
      { routine_id: 1, session_date: "2026-11-06", end_time: null }, // in progress
      { routine_id: 2, session_date: "2026-10-01", end_time: "09:00:00" },
      { routine_id: null, session_date: "2026-11-06", end_time: "09:00:00" },
    ])).toEqual({ 1: "2026-11-04", 2: "2026-10-01" });
  });
});

describe("formatLastDone", () => {
  const now = new Date(2026, 10, 6, 15, 0); // Nov 6 2026, local
  it.each([
    ["2026-11-06", "today"],
    ["2026-11-05", "yesterday"],
    ["2026-11-01", "5 days ago"],
    ["2026-10-24", "13 days ago"],
    ["2026-10-23", "2 weeks ago"],
    ["2026-09-14", "on Sep 14"],
    ["2025-09-14", "on Sep 14, 2025"],
  ])("%s → %s", (date, text) => {
    expect(formatLastDone(date, now)).toBe(text);
  });
});

describe("nextUpRoutineId", () => {
  const { nextUpRoutineId } = jest.requireActual("../utils/lastDone");
  const now = new Date(2026, 10, 11, 9); // Wed Nov 11

  it("picks the routine in rotation done longest ago", () => {
    // Push Mon 2nd, Pull Wed 4th, Legs Fri 6th, Push Mon 9th → Pull next
    expect(nextUpRoutineId([1, 2, 3], { 1: "2026-11-09", 2: "2026-11-04", 3: "2026-11-06" }, now)).toBe(2);
  });

  it("ignores routines not done lately and never-done ones", () => {
    expect(nextUpRoutineId([1, 2, 3, 4], { 1: "2026-11-09", 2: "2026-11-06", 3: "2026-01-01" }, now)).toBe(2);
  });

  it("needs two routines in rotation", () => {
    expect(nextUpRoutineId([1, 2], { 1: "2026-11-09" }, now)).toBeNull();
    expect(nextUpRoutineId([1], { 1: "2026-11-09" }, now)).toBeNull();
  });

  it("breaks ties by display order", () => {
    expect(nextUpRoutineId([3, 1, 2], { 1: "2026-11-05", 2: "2026-11-09", 3: "2026-11-05" }, now)).toBe(3);
  });

  it("says nothing when everything was done today", () => {
    expect(nextUpRoutineId([1, 2], { 1: "2026-11-11", 2: "2026-11-11" }, now)).toBeNull();
  });
});
