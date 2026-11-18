import { buildWorkoutSummary, formatWorkoutDuration } from "@/utils/workoutSummary";

const bench = { session_exercise_id: 1, exercise_id: "bench", exercise_name: "Bench Press", exercise_type: "strength" };
const pullup = { session_exercise_id: 2, exercise_id: "pullup", exercise_name: "Pull Up", exercise_type: "strength" };
const run = { session_exercise_id: 3, exercise_id: "run", exercise_name: "Running", exercise_type: "cardio" };
const curl = { session_exercise_id: 4, exercise_id: "curl", exercise_name: "Curl", exercise_type: "strength" };

describe("buildWorkoutSummary", () => {
  const sets = {
    1: [
      { weight: 135, reps: 10, completed: true, is_warmup: true },
      { weight: 185, reps: 5, completed: true },
      { weight: 175, reps: 8, completed: true }, // higher e1RM than 185×5
      { weight: 225, reps: 1, completed: false }, // not completed: ignored
    ],
    2: [
      { weight: null, reps: 8, completed: true },
      { weight: null, reps: 12, completed: true },
    ],
    3: [
      { distance_meters: 3000, duration_seconds: 900, completed: true },
      { distance_meters: 2000, duration_seconds: 600, completed: true },
    ],
    4: [{ weight: 30, reps: 10, completed: false }],
  };

  const s = buildWorkoutSummary([bench, pullup, run, curl], sets, [{ exerciseId: "bench", label: "Weight" }], 3725.4);

  it("totals completed sets, volume (incl. warmups) and reps", () => {
    expect(s.completedSets).toBe(7);
    expect(s.totalVolumeLbs).toBe(135 * 10 + 185 * 5 + 175 * 8);
    expect(s.totalReps).toBe(10 + 5 + 8 + 8 + 12);
    expect(s.durationSeconds).toBe(3725);
  });

  it("picks the best working set by estimated 1RM", () => {
    const b = s.exercises.find((e) => e.exerciseId === "bench")!;
    expect(b.completedSets).toBe(3);
    expect(b.bestSet).toEqual({ weight: 175, reps: 8 });
    expect(b.pr).toBe("Weight");
  });

  it("uses most reps for bodyweight sets", () => {
    expect(s.exercises.find((e) => e.exerciseId === "pullup")!.bestSet).toEqual({ weight: null, reps: 12 });
  });

  it("sums cardio distance and time", () => {
    const r = s.exercises.find((e) => e.exerciseId === "run")!;
    expect(r.isCardio).toBe(true);
    expect(r.distanceMeters).toBe(5000);
    expect(r.durationSeconds).toBe(1500);
    expect(s.totalDistanceMeters).toBe(5000);
  });

  it("leaves out exercises with no completed sets and counts PRs", () => {
    expect(s.exercises.map((e) => e.exerciseId)).toEqual(["bench", "pullup", "run"]);
    expect(s.prCount).toBe(1);
  });

  it("handles an empty workout", () => {
    const empty = buildWorkoutSummary([bench], {}, [], -5);
    expect(empty).toMatchObject({ completedSets: 0, totalVolumeLbs: 0, exercises: [], prCount: 0, durationSeconds: 0 });
  });
});

describe("formatWorkoutDuration", () => {
  it("formats compactly", () => {
    expect(formatWorkoutDuration(45)).toBe("45s");
    expect(formatWorkoutDuration(42 * 60 + 10)).toBe("42m");
    expect(formatWorkoutDuration(3600 + 5 * 60)).toBe("1h 05m");
  });
});

describe("best set with high reps", () => {
  it("prefers 100x15 over 60x5", () => {
    const { buildWorkoutSummary } = require("@/utils/workoutSummary");
    const summary = buildWorkoutSummary(
      [{ session_exercise_id: 1, exercise_id: "curl", exercise_name: "Curl", exercise_type: "strength" }],
      { 1: [
        { weight: 60, reps: 5, completed: true, is_warmup: false },
        { weight: 100, reps: 15, completed: true, is_warmup: false },
      ] },
      [],
      600,
    );
    expect(summary.exercises[0].bestSet).toEqual({ weight: 100, reps: 15 });
  });
});

import { ordinal, workoutNumberFrom } from "../utils/workoutSummary";

describe("workout number", () => {
  it("formats ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112].map(ordinal)).toEqual(
      ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th", "112th"]);
  });

  it("counts earlier finished workouts, whether or not history already has this one", () => {
    const done = [{ session_id: 1, end_time: "x" }, { session_id: 2, end_time: "x" }];
    expect(workoutNumberFrom(done, 3)).toBe(3);
    expect(workoutNumberFrom([...done, { session_id: 3, end_time: "x" }], 3)).toBe(3);
    expect(workoutNumberFrom([...done, { session_id: 9, end_time: null }], 3)).toBe(3);
    expect(workoutNumberFrom(null, 3)).toBeNull();
  });
});

describe("same exercise twice", () => {
  it("counts its PR once", () => {
    const top = { session_exercise_id: 10, exercise_id: "bench", exercise_name: "Bench Press", exercise_type: "strength" };
    const backoff = { ...top, session_exercise_id: 11 };
    const s = buildWorkoutSummary(
      [top, backoff],
      { 10: [{ weight: 225, reps: 3, completed: true }], 11: [{ weight: 185, reps: 8, completed: true }] },
      [{ exerciseId: "bench", label: "Weight" }],
      600,
    );
    expect(s.prCount).toBe(1);
    expect(s.exercises.map((e) => e.pr)).toEqual(["Weight", null]);
  });
});

describe("vs last time", () => {
  const benchA = { session_exercise_id: 10, exercise_id: "bench", exercise_name: "Bench Press", exercise_type: "strength" };
  const pull = { session_exercise_id: 11, exercise_id: "pullup", exercise_name: "Pull Up", exercise_type: "strength" };
  const fresh = { session_exercise_id: 12, exercise_id: "new", exercise_name: "New Lift", exercise_type: "strength" };
  const sets = {
    10: [
      { weight: 95, reps: 10, completed: true, is_warmup: true }, // warm-ups don't count
      { weight: 185, reps: 5, completed: true },
      { weight: 185, reps: 5, completed: true },
    ],
    11: [{ weight: null, reps: 10, completed: true }, { weight: null, reps: 8, completed: true }],
    12: [{ weight: 50, reps: 10, completed: true }],
  };
  const last = {
    bench: [{ weight: 135, reps: 8, is_warmup: true }, { weight: 175, reps: 5 }, { weight: 175, reps: 5 }],
    pullup: [{ weight: null, reps: 8 }, { weight: null, reps: 8 }],
  };
  const s = buildWorkoutSummary([benchA, pull, fresh], sets, [], 60, last);

  it("compares working-set volume per exercise", () => {
    expect(s.exercises[0].change).toEqual({ kind: "volume", diff: 100, pct: 6 });
  });
  it("compares reps for bodyweight work", () => {
    expect(s.exercises[1].change).toEqual({ kind: "reps", diff: 2, pct: 13 });
  });
  it("has no comparison for an exercise without a last time", () => {
    expect(s.exercises[2].change).toBeNull();
  });
  it("totals volume change only over exercises with a last time", () => {
    // 1850 vs 1750, ignoring New Lift's 500
    expect(s.volumeChangePct).toBe(6);
  });
  it("skips an exercise done twice today (no like-for-like last time)", () => {
    const again = { ...benchA, session_exercise_id: 13 };
    const t = buildWorkoutSummary([benchA, again], { 10: sets[10], 13: [{ weight: 135, reps: 10, completed: true }] }, [], 60, last);
    expect(t.exercises.map((e) => e.change)).toEqual([null, null]);
    expect(t.volumeChangePct).toBeNull();
  });
  it("defaults to no comparison", () => {
    expect(buildWorkoutSummary([benchA], sets, [], 60).volumeChangePct).toBeNull();
  });
});

it("an empty duplicate entry doesn't block the comparison", () => {
  const b1 = { session_exercise_id: 20, exercise_id: "bench", exercise_name: "Bench", exercise_type: "strength" };
  const b2 = { ...b1, session_exercise_id: 21 };
  const s = buildWorkoutSummary([b1, b2], { 20: [{ weight: 100, reps: 10, completed: true }], 21: [{ weight: 100, reps: 10, completed: false }] }, [], 60,
    { bench: [{ weight: 100, reps: 8 }] });
  expect(s.exercises[0].change).toEqual({ kind: "volume", diff: 200, pct: 25 });
});
