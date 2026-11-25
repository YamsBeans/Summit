import { sessionDurationMins } from "@/utils/duration";

describe("sessionDurationMins", () => {
  it("handles a normal workout", () => {
    expect(sessionDurationMins("2026-11-04", "18:00:00", "19:15:30")).toBe(75);
  });
  it("wraps a workout that runs past midnight", () => {
    expect(sessionDurationMins("2026-11-04", "23:30:00", "00:40:00")).toBe(70);
  });
  it("returns null while in progress or for bad input", () => {
    expect(sessionDurationMins("2026-11-04", "18:00:00", null)).toBeNull();
    expect(sessionDurationMins("2026-11-04", "garbage", "19:00:00")).toBeNull();
  });
  it("accepts full timestamps", () => {
    expect(sessionDurationMins("2026-11-04", "2026-11-04T18:00:00", "2026-11-04T18:45:00")).toBe(45);
  });
  it("does not wrap a negative span between full timestamps", () => {
    expect(sessionDurationMins("2026-11-04", "2026-11-04T18:00:00", "2026-11-04T17:00:00")).toBeNull();
  });
});
