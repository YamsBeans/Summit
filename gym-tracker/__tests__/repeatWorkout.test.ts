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

import { saveWorkoutAsRoutine } from "../utils/repeatWorkout";

it("saves a workout as a routine with its completed sets as targets", async () => {
  const { db } = fakeDb();
  const made = { routines: [] as any[], exercises: [] as any[], sets: [] as any[] };
  let id = 1;
  const sdb = {
    ...db,
    getSessionExerciseSets: async (exId: number) => ({
      data: exId === 10
        ? [
            { set_number: 1, is_warmup: true, weight: 95, reps: 10, completed: true },
            { set_number: 2, is_warmup: false, weight: 185, reps: 5, completed: true },
            { set_number: 3, is_warmup: false, weight: null, reps: null, completed: false },
          ]
        : [{ set_number: 1, is_warmup: false, weight: 95, reps: 8, completed: false }],
      error: null,
    }),
    insertRoutine: async (r: any) => { const row = { routine_id: id++, ...r }; made.routines.push(row); return { data: row, error: null }; },
    insertRoutineExercise: async (e: any) => { const row = { routine_exercise_id: id++, ...e }; made.exercises.push(row); return { data: row, error: null }; },
    insertRoutineExerciseSet: async (s: any) => { made.sets.push(s); return { data: null, error: null }; },
    deleteRoutine: async () => ({ error: null }),
  };
  const res = await saveWorkoutAsRoutine(sdb, 1, "u1", "  My Push ");
  expect(res).toEqual({ routineId: 1 });
  expect(made.routines[0]).toMatchObject({ routine_name: "My Push", user_id: "u1" });
  expect(made.exercises.map((e) => e.exercise_id)).toEqual(["bench", "ohp"]);
  const bench = made.sets.filter((s) => s.routine_exercise_id === made.exercises[0].routine_exercise_id);
  expect(bench.map((s) => [s.set_number, s.is_warmup, s.target_weight, s.target_reps])).toEqual([[1, true, 95, 10], [2, false, 185, 5]]);
  // Nothing checked off for OHP: all its sets are used.
  expect(made.sets.filter((s) => s.routine_exercise_id === made.exercises[1].routine_exercise_id)[0]).toMatchObject({ target_weight: 95, target_reps: 8 });
});

import { duplicateRoutine } from "../utils/repeatWorkout";

it("duplicates a routine with its exercises and target sets", async () => {
  const made = { routines: [] as any[], exercises: [] as any[], sets: [] as any[] };
  let id = 50;
  const res = await duplicateRoutine({
    getRoutineExercises: async () => ({ data: [
      { routine_exercise_id: 2, exercise_id: "row", exercise_name: "Row", exercise_order: 2 },
      { routine_exercise_id: 1, exercise_id: "pull", exercise_name: "Pull-up", exercise_order: 1 },
    ], error: null }),
    getRoutineExerciseSets: async (reId: number) => ({ data: reId === 1 ? [{ set_number: 1, target_reps: 8, is_warmup: false }] : [], error: null }),
    insertRoutine: async (r: any) => { const row = { routine_id: id++, ...r }; made.routines.push(row); return { data: row, error: null }; },
    insertRoutineExercise: async (e: any) => { const row = { routine_exercise_id: id++, ...e }; made.exercises.push(row); return { data: row, error: null }; },
    insertRoutineExerciseSet: async (s: any) => { made.sets.push(s); return { error: null }; },
    deleteRoutine: async () => ({ error: null }),
  }, { routine_id: 9, routine_name: "Pull Day", description: "Back" }, "u1");
  expect(res).toEqual({ routineId: 50 });
  expect(made.routines[0]).toMatchObject({ routine_name: "Pull Day (copy)", description: "Back" });
  expect(made.exercises.map((e) => e.exercise_id)).toEqual(["pull", "row"]);
  expect(made.sets).toEqual([expect.objectContaining({ routine_exercise_id: made.exercises[0].routine_exercise_id, target_reps: 8 })]);
});

function copyDb(failOn: "exercise" | "set" | "read") {
  const deleted: number[] = [];
  let id = 70;
  const db = {
    getRoutineExercises: async () => ({ data: [
      { routine_exercise_id: 1, exercise_id: "squat", exercise_name: "Squat", exercise_order: 1 },
      { routine_exercise_id: 2, exercise_id: "lunge", exercise_name: "Lunge", exercise_order: 2 },
    ], error: null }),
    getRoutineExerciseSets: async (reId: number) => (failOn === "read" && reId === 2
      ? { data: null as any, error: { message: "Network request failed" } }
      : { data: [{ set_number: 1, target_reps: 5 }, { set_number: 2, target_reps: 5 }], error: null }),
    insertRoutine: async (r: any) => ({ data: { routine_id: id++, ...r }, error: null }),
    insertRoutineExercise: async (e: any) => (failOn === "exercise" && e.exercise_id === "lunge"
      ? { data: null, error: { message: "You're offline." } }
      : { data: { routine_exercise_id: id++, ...e }, error: null }),
    insertRoutineExerciseSet: async (s: any) => (failOn === "set" && s.set_number === 2
      ? { error: { message: "You're offline." } }
      : { error: null }),
    deleteRoutine: async (rid: number) => { deleted.push(rid); return { error: null }; },
  };
  return { db, deleted };
}

it.each(["exercise", "set"] as const)("duplicate removes the half-made copy when a %s insert fails", async (failOn) => {
  const { db, deleted } = copyDb(failOn);
  const res = await duplicateRoutine(db, { routine_id: 9, routine_name: "Legs", description: null }, "u1");
  expect(res).toEqual({ error: "You're offline." });
  expect(deleted).toEqual([70]);
});

it("duplicate refuses to copy when a routine's sets can't be read", async () => {
  const { db, deleted } = copyDb("read");
  const res = await duplicateRoutine(db, { routine_id: 9, routine_name: "Legs", description: null }, "u1");
  expect(res).toEqual({ error: "Network request failed" });
  expect(deleted).toEqual([]);
});

it("save as routine removes the routine when an insert fails", async () => {
  const { db } = fakeDb();
  const deleted: number[] = [];
  const res = await saveWorkoutAsRoutine({
    ...db,
    insertRoutine: async (r: any) => ({ data: { routine_id: 5, ...r }, error: null }),
    insertRoutineExercise: async (e: any) => (e.exercise_order === 2
      ? { data: null, error: { message: "Network request failed" } }
      : { data: { routine_exercise_id: 6, ...e }, error: null }),
    insertRoutineExerciseSet: async () => ({ error: null }),
    deleteRoutine: async (rid: number) => { deleted.push(rid); return { error: null }; },
  }, 1, "u1", "Push");
  expect(res).toEqual({ error: "Network request failed" });
  expect(deleted).toEqual([5]);
});

it("says when the half-made copy couldn't be removed", async () => {
  const { db } = copyDb("set");
  const res = await duplicateRoutine({ ...db, deleteRoutine: async () => ({ error: { message: "You're offline." } }) },
    { routine_id: 9, routine_name: "Legs", description: null }, "u1");
  expect(res).toEqual({ error: "You're offline. A partial copy was left in your routines; delete it before trying again." });
});
