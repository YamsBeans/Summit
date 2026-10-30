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
