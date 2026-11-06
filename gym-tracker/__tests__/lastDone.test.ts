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
