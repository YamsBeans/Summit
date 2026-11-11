import { topLifts, type LiftEntry } from "../utils/topLifts";

const now = new Date(2026, 10, 11, 9);
const set = (weight: number, reps: number, extra: object = {}) => ({ weight, reps, completed: true, ...extra });
const entry = (date: string, exerciseId: string, sets: LiftEntry["sets"], extra: Partial<LiftEntry> = {}): LiftEntry =>
  ({ date, exerciseId, exerciseName: exerciseId.toUpperCase(), sets, ...extra });

describe("topLifts", () => {
  it("ranks by sessions in the last 90 days and needs two of them", () => {
    const lifts = topLifts([
      entry("2026-11-09", "bench", [set(200, 5)]),
      entry("2026-11-02", "bench", [set(195, 5)]),
      entry("2026-10-26", "bench", [set(190, 5)]),
      entry("2026-11-05", "squat", [set(300, 3)]),
      entry("2026-10-29", "squat", [set(290, 3)]),
      entry("2026-11-06", "curl", [set(40, 10)]),
    ], now);
    expect(lifts.map((l) => l.exerciseId)).toEqual(["bench", "squat"]);
    expect(lifts[0].name).toBe("BENCH");
    expect(lifts[0].sessions).toBe(3);
  });

  it("compares the last 30 days with the 60 before", () => {
    const [bench] = topLifts([
      entry("2026-09-01", "bench", [set(180, 5)]), // 210
      entry("2026-11-01", "bench", [set(200, 5)]), // 233.3
      entry("2026-11-08", "bench", [set(195, 5)]),
    ], now);
    expect(bench.current).toBe(233.3);
    expect(bench.change).toBe(23.3);
    expect(bench.series).toEqual([210, 233.3, 227.5]);
  });

  it("has no change without older sessions", () => {
    const [bench] = topLifts([
      entry("2026-11-01", "bench", [set(200, 5)]),
      entry("2026-11-08", "bench", [set(195, 5)]),
    ], now);
    expect(bench.change).toBeNull();
  });

  it("ignores warm-ups, unticked sets, cardio and lifts not done lately", () => {
    const lifts = topLifts([
      entry("2026-11-01", "bench", [set(300, 1, { is_warmup: true }), set(400, 1, { completed: false }), set(200, 5)]),
      entry("2026-11-08", "bench", [set(195, 5)]),
      entry("2026-11-01", "run", [set(0, 0)], { exerciseType: "cardio" }),
      entry("2026-11-08", "run", [set(0, 0)], { exerciseType: "cardio" }),
      entry("2026-05-01", "dead", [set(400, 5)]),
      entry("2026-05-08", "dead", [set(405, 5)]),
    ], now);
    expect(lifts.map((l) => l.exerciseId)).toEqual(["bench"]);
    expect(lifts[0].current).toBe(233.3);
  });

  it("counts the same lift twice in one workout as one session", () => {
    const [bench] = topLifts([
      entry("2026-11-08", "bench", [set(225, 3)]),
      entry("2026-11-08", "bench", [set(185, 8)]),
      entry("2026-11-01", "bench", [set(185, 8)]),
    ], now);
    expect(bench.sessions).toBe(2);
    expect(bench.series).toEqual([234.3, 247.5]);
  });
});
