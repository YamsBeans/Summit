import { repeatWorkout, RepeatDb } from "../utils/repeatWorkout";

function fakeDb() {
  let id = 100;
  const inserted = { sessions: [] as any[], exercises: [] as any[], sets: [] as any[] };
  const db: RepeatDb = {
    getWorkoutSession: async () => ({ data: { session_id: 1, session_name: "Push Day", routine_id: 7 }, error: null }),
    getSessionExercises: async () => ({
      data: [
        { session_exercise_id: 11, exercise_id: "ohp", exercise_name: "OHP", exercise_order: 2, exercise_type: "strength" },
        { session_exercise_id: 10, exercise_id: "bench", exercise_name: "Bench", exercise_order: 1, exercise_type: "strength" },
      ],
      error: null,
    }),
    getSessionExerciseSets: async (exId: number) => ({
      data: exId === 10
        ? [{ set_number: 2, is_warmup: false, weight: 185, reps: 5 }, { set_number: 1, is_warmup: true, weight: 95, reps: 10 }]
        : [],
      error: null,
    }),
    startWorkoutSession: async (p) => { const s = { session_id: id++, ...p }; inserted.sessions.push(s); return { data: s, error: null }; },
    insertSessionExercise: async (e) => { const r = { session_exercise_id: id++, ...e }; inserted.exercises.push(r); return { data: r, error: null }; },
    insertSessionExerciseSet: async (s) => { inserted.sets.push(s); return { data: s, error: null }; },
  };
  return { db, inserted };
}

it("copies exercises in order with the same sets, values left empty", async () => {
  const { db, inserted } = fakeDb();
  const res = await repeatWorkout(db, 1, "u1");
  expect(res).toEqual({ sessionId: 100, sessionName: "Push Day" });
  expect(inserted.sessions[0]).toMatchObject({ routine_id: null, session_name: "Push Day", user_id: "u1" });
  expect(inserted.exercises.map((e) => [e.exercise_id, e.exercise_order])).toEqual([["bench", 1], ["ohp", 2]]);
  const bench = inserted.sets.filter((s) => s.session_exercise_id === inserted.exercises[0].session_exercise_id);
  expect(bench.map((s) => [s.set_number, s.is_warmup, s.weight, s.reps])).toEqual([[1, true, null, null], [2, false, null, null]]);
  // An exercise with no logged sets still gets one row to fill in.
  expect(inserted.sets.filter((s) => s.session_exercise_id === inserted.exercises[1].session_exercise_id)).toHaveLength(1);
});

it("reports a workout that can't be loaded", async () => {
  const { db } = fakeDb();
  db.getWorkoutSession = async () => ({ data: null, error: { message: "nope" } });
  expect(await repeatWorkout(db, 1, "u1")).toEqual({ error: "Couldn't load that workout." });
});
