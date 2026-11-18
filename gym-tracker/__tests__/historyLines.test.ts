import { buildExerciseLine } from "../utils/historyLines";

const ex = { exercise_name: "Bench", exercise_type: "strength" };

it("counts completed working sets and picks the best by estimated 1RM", () => {
  const line = buildExerciseLine(ex, [
    { weight: 45, reps: 10, is_warmup: true, completed: true },
    { weight: 185, reps: 5, completed: true },
    { weight: 175, reps: 8, completed: true }, // 221.7 beats 185×5's 215.8
    { weight: 225, reps: 1, completed: false }, // never done
    { weight: 165, reps: 8, completed: null }, // older row: counts as done
  ]);
  expect(line.sets).toBe(3);
  expect(line.best).toEqual({ weight: 175, reps: 8 });
});

it("doesn't zero out high-rep sets", () => {
  expect(buildExerciseLine(ex, [
    { weight: 60, reps: 5, completed: true },
    { weight: 100, reps: 15, completed: true },
  ]).best).toEqual({ weight: 100, reps: 15 });
});

it("ranks bodyweight sets by reps, below weighted ones", () => {
  expect(buildExerciseLine(ex, [{ weight: null, reps: 12 }, { weight: null, reps: 15 }]).best).toEqual({ weight: null, reps: 15 });
  expect(buildExerciseLine(ex, [{ weight: null, reps: 30 }, { weight: 10, reps: 5 }]).best).toEqual({ weight: 10, reps: 5 });
});

it("picks the longest cardio set", () => {
  const line = buildExerciseLine({ exercise_name: "Run", exercise_type: "cardio" }, [
    { distance_meters: 3000, duration_seconds: 900 },
    { distance_meters: 5000, duration_seconds: 1500 },
  ]);
  expect(line.cardio).toBe(true);
  expect(line.bestCardio).toEqual({ distance_meters: 5000, duration_seconds: 1500 });
  expect(line.best).toBeNull();
});

it("has no best set when nothing has numbers", () => {
  expect(buildExerciseLine(ex, [{ completed: true }]).best).toBeNull();
});
