// "Previous" numbers come from the newest finished workout that has the
// exercise, using only sets that were actually done.

const mockStore: Record<string, string> = {};
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn((k: string) => Promise.resolve(mockStore[k] ?? null)),
  setItem: jest.fn((k: string, v: string) => { mockStore[k] = v; return Promise.resolve(); }),
  removeItem: jest.fn((k: string) => { delete mockStore[k]; return Promise.resolve(); }),
}));

import { localDb, __resetLocalDbForTests } from "../backend/localDb";

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["setTimeout", "setInterval", "setImmediate", "nextTick", "queueMicrotask"] });
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  __resetLocalDbForTests();
});

async function logWorkout(userId: string, exerciseId: string, sets: { weight: number; completed: boolean }[], at: string) {
  jest.setSystemTime(new Date(at));
  const { data: session } = await localDb.startWorkoutSession({ routine_id: null, session_name: "W", user_id: userId });
  const { data: ex } = await localDb.insertSessionExercise({
    session_id: session!.session_id, exercise_id: exerciseId, exercise_name: exerciseId, exercise_order: 1, notes: null,
  });
  let n = 1;
  for (const s of sets) {
    await localDb.insertSessionExerciseSet({
      session_exercise_id: ex!.session_exercise_id, set_number: n++, weight: s.weight, reps: 5, is_warmup: false, completed: s.completed,
    });
  }
  await localDb.finishWorkoutSession(session!.session_id, null);
  return session!;
}

it("skips newer workouts that don't include the exercise and ignores unticked sets", async () => {
  const { data } = await localDb.signUp("a@b.c", "pw", "alex");
  const userId = data!.user.id;
  await logWorkout(userId, "squat", [{ weight: 225, completed: true }, { weight: 235, completed: false }], "2026-11-02T10:00:00Z");
  await logWorkout(userId, "bench", [{ weight: 135, completed: true }], "2026-11-04T10:00:00Z");
  const { data: current } = await localDb.startWorkoutSession({ routine_id: null, session_name: "Now", user_id: userId });

  const { data: prev } = await localDb.getPreviousSessionSets("squat", userId, current!.session_id);
  expect(prev.map((s: any) => s.weight)).toEqual([225]);
});

it("keeps each instance of an exercise apart, in workout order", async () => {
  const { data } = await localDb.signUp("a@b.c", "pw", "alex");
  const userId = data!.user.id;
  jest.setSystemTime(new Date("2026-11-02T10:00:00Z"));
  const { data: session } = await localDb.startWorkoutSession({ routine_id: null, session_name: "Legs", user_id: userId });
  // Back-offs inserted first but ordered second: order decides, not insert time.
  const blocks: [number, number][] = [[2, 185], [1, 275]];
  for (const [order, weight] of blocks) {
    const { data: ex } = await localDb.insertSessionExercise({
      session_id: session!.session_id, exercise_id: "squat", exercise_name: "Squat", exercise_order: order, notes: null,
    });
    await localDb.insertSessionExerciseSet({
      session_exercise_id: ex!.session_exercise_id, set_number: 1, weight, reps: 5, is_warmup: false, completed: true,
    });
  }
  await localDb.finishWorkoutSession(session!.session_id, null);
  const { data: current } = await localDb.startWorkoutSession({ routine_id: null, session_name: "Now", user_id: userId });

  const res = await localDb.getPreviousSessionSets("squat", userId, current!.session_id);
  expect(res.instances.map((i: any[]) => i.map((s) => s.weight))).toEqual([[275], [185]]);
  expect(res.data.map((s: any) => s.weight)).toEqual([275]);
});

afterEach(() => jest.useRealTimers());
