import {
  secondsToDigits,
  formatDigits,
  digitsToSeconds,
  parseDuration,
  formatDuration,
  formatDurationShort,
  metersToKm,
  metersToMiles,
  kmToMeters,
  milesToMeters,
  formatDistance,
  parseDistanceToMeters,
  metersToDisplay,
  computePace,
  formatPace,
  computeSpeed,
  computeCardioSummary,
} from "../utils/cardioUtils";

// ─── Duration digit helpers ───────────────────────────────────────────────────

describe("secondsToDigits", () => {
  it("returns empty string for null/zero/negative", () => {
    expect(secondsToDigits(null)).toBe("");
    expect(secondsToDigits(undefined)).toBe("");
    expect(secondsToDigits(0)).toBe("");
    expect(secondsToDigits(-5)).toBe("");
  });

  it("formats seconds-only", () => {
    expect(secondsToDigits(45)).toBe("45");
  });

  it("formats minutes:seconds with zero-padding", () => {
    expect(secondsToDigits(90)).toBe("130"); // 1:30
  });

  it("formats hours:minutes:seconds with zero-padding", () => {
    expect(secondsToDigits(5400)).toBe("13000"); // 1:30:00
    expect(secondsToDigits(3661)).toBe("10101"); // 1:01:01
  });
});

describe("formatDigits", () => {
  it("returns empty string for empty input", () => {
    expect(formatDigits("")).toBe("");
  });

  it("formats a short buffer as m:ss", () => {
    expect(formatDigits("130")).toBe("1:30");
    expect(formatDigits("45")).toBe("0:45");
  });

  it("formats a long buffer as h:mm:ss", () => {
    expect(formatDigits("13000")).toBe("1:30:00");
  });
});

describe("digitsToSeconds", () => {
  it("returns 0 for empty input", () => {
    expect(digitsToSeconds("")).toBe(0);
  });

  it("round-trips with secondsToDigits", () => {
    expect(digitsToSeconds("130")).toBe(90);
    expect(digitsToSeconds("13000")).toBe(5400);
    expect(digitsToSeconds(secondsToDigits(3661))).toBe(3661);
  });
});

// ─── Duration parse/format ─────────────────────────────────────────────────────

describe("parseDuration", () => {
  it("returns null for empty/unparseable", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("   ")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("1:bad")).toBeNull();
  });

  it("parses mm:ss", () => {
    expect(parseDuration("1:30")).toBe(90);
    expect(parseDuration(" 2:00 ")).toBe(120);
  });

  it("parses h:mm:ss", () => {
    expect(parseDuration("1:30:00")).toBe(5400);
    expect(parseDuration("1:01:01")).toBe(3661);
  });

  it("parses a plain seconds number", () => {
    expect(parseDuration("90")).toBe(90);
  });
});

describe("formatDuration", () => {
  it("formats under an hour as mm:ss", () => {
    expect(formatDuration(90)).toBe("01:30");
    expect(formatDuration(45)).toBe("00:45");
  });

  it("formats an hour or more as h:mm:ss", () => {
    expect(formatDuration(5400)).toBe("1:30:00");
    expect(formatDuration(3661)).toBe("1:01:01");
  });

  it("rounds fractional seconds", () => {
    expect(formatDuration(90.4)).toBe("01:30");
  });
});

describe("formatDurationShort", () => {
  it("formats minutes only", () => {
    expect(formatDurationShort(90)).toBe("1m");
  });

  it("formats hours and minutes", () => {
    expect(formatDurationShort(5400)).toBe("1h 30m");
    expect(formatDurationShort(3661)).toBe("1h 1m");
  });
});

// ─── Distance conversions ──────────────────────────────────────────────────────

describe("distance conversions", () => {
  it("converts meters to km/miles", () => {
    expect(metersToKm(5000)).toBe(5);
    expect(metersToMiles(1609.344)).toBeCloseTo(1, 5);
  });

  it("converts km/miles to meters", () => {
    expect(kmToMeters(5)).toBe(5000);
    expect(milesToMeters(1)).toBeCloseTo(1609.344, 3);
  });

  it("formats distance with the active unit", () => {
    expect(formatDistance(5000, "km")).toBe("5.00 km");
    expect(formatDistance(1609.344, "mi")).toBe("1.00 mi");
  });

  it("parses a user-entered distance to meters", () => {
    expect(parseDistanceToMeters("5", "km")).toBe(5000);
    expect(parseDistanceToMeters("3.1", "mi")).toBeCloseTo(4988.97, 1);
    expect(parseDistanceToMeters("abc", "km")).toBeNull();
  });

  it("converts meters to a display number", () => {
    expect(metersToDisplay(5000, "km")).toBe(5);
    expect(metersToDisplay(1609.344, "mi")).toBeCloseTo(1, 5);
  });
});

// ─── Pace / speed ──────────────────────────────────────────────────────────────

describe("pace and speed", () => {
  it("computes pace in sec/km", () => {
    expect(computePace(1000, 300)).toBe(300);
    expect(computePace(5000, 1500)).toBe(300);
  });

  it("returns 0 pace for non-positive distance", () => {
    expect(computePace(0, 300)).toBe(0);
  });

  it("formats pace", () => {
    expect(formatPace(300)).toBe("5:00 /km");
    expect(formatPace(330)).toBe("5:30 /km");
  });

  it("computes speed in km/h", () => {
    expect(computeSpeed(10000, 3600)).toBe(10);
  });

  it("returns 0 speed for non-positive duration", () => {
    expect(computeSpeed(10000, 0)).toBe(0);
  });
});

// ─── Cardio summary aggregation ────────────────────────────────────────────────

describe("computeCardioSummary", () => {
  it("returns zeros for no sets", () => {
    expect(computeCardioSummary([])).toEqual({
      totalDistanceMeters: 0,
      totalDurationSeconds: 0,
      bestPaceSecPerKm: null,
      bestDistanceMeters: 0,
    });
  });

  it("aggregates a single completed set and derives pace when absent", () => {
    const summary = computeCardioSummary([
      { distance_meters: 5000, duration_seconds: 1500, completed: true },
    ]);
    expect(summary.totalDistanceMeters).toBe(5000);
    expect(summary.totalDurationSeconds).toBe(1500);
    expect(summary.bestDistanceMeters).toBe(5000);
    expect(summary.bestPaceSecPerKm).toBe(300); // derived: 1500 / (5000/1000)
  });

  it("ignores incomplete and non-cardio sets", () => {
    const summary = computeCardioSummary([
      { distance_meters: 9000, duration_seconds: 1000, completed: false }, // skipped
      { weight: 100, reps: 5 } as any, // not a cardio set
      { distance_meters: 2000, duration_seconds: 600, completed: true },
    ]);
    expect(summary.totalDistanceMeters).toBe(2000);
    expect(summary.totalDurationSeconds).toBe(600);
    expect(summary.bestDistanceMeters).toBe(2000);
  });

  it("tracks the best (fastest) pace and longest distance across sets", () => {
    const summary = computeCardioSummary([
      { distance_meters: 1000, duration_seconds: 360, pace_sec_per_km: 360, completed: true },
      { distance_meters: 3000, duration_seconds: 900, pace_sec_per_km: 300, completed: true },
    ]);
    expect(summary.totalDistanceMeters).toBe(4000);
    expect(summary.totalDurationSeconds).toBe(1260);
    expect(summary.bestDistanceMeters).toBe(3000);
    expect(summary.bestPaceSecPerKm).toBe(300); // lowest sec/km wins
  });

  it("treats a set with duration but no distance as cardio", () => {
    const summary = computeCardioSummary([
      { duration_seconds: 1200, completed: true },
    ]);
    expect(summary.totalDurationSeconds).toBe(1200);
    expect(summary.totalDistanceMeters).toBe(0);
    expect(summary.bestPaceSecPerKm).toBeNull(); // no distance → no pace
  });
});
