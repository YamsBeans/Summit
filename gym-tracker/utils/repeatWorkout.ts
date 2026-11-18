// "Repeat workout" (like Strong/Hevy): start a new workout with the same
// exercises, in the same order, and the same number of sets (warm-ups kept).
// Values start empty, so last time's numbers show as the PREVIOUS column and
// placeholders, ready to tap-to-fill.

type DbResult<T = any> = { data: T; error: any };

export type RepeatDb = {
  getWorkoutSession: (id: number) => Promise<DbResult>;
  getSessionExercises: (id: number) => Promise<DbResult<any[]>>;
  getSessionExerciseSets: (id: number) => Promise<DbResult<any[]>>;
  startWorkoutSession: (p: { routine_id: number | null; session_name: string; user_id: string }) => Promise<DbResult>;
  insertSessionExercise: (e: any) => Promise<DbResult>;
  insertSessionExerciseSet: (s: any) => Promise<DbResult>;
};

export async function repeatWorkout(
  db: RepeatDb,
  sessionId: number,
  userId: string,
): Promise<{ sessionId: number; sessionName: string } | { error: string }> {
  const [{ data: past }, { data: exercises }] = await Promise.all([
    db.getWorkoutSession(sessionId),
    db.getSessionExercises(sessionId),
  ]);
  if (!past) return { error: "Couldn't load that workout." };
  const ordered = [...(exercises ?? [])].sort((a, b) => a.exercise_order - b.exercise_order);
  const setsPerExercise = await Promise.all(ordered.map((ex) => db.getSessionExerciseSets(ex.session_exercise_id)));

  const { data: session, error } = await db.startWorkoutSession({
    // Not tied to the routine: finishing a repeat shouldn't rewrite it.
    routine_id: null,
    session_name: past.session_name,
    user_id: userId,
  });
  if (error || !session) return { error: error?.message ?? "Couldn't start the workout." };

  for (let i = 0; i < ordered.length; i++) {
    const ex = ordered[i];
    const { data: newEx, error: exErr } = await db.insertSessionExercise({
      session_id: session.session_id,
      exercise_id: ex.exercise_id,
      exercise_name: ex.exercise_name,
      exercise_order: i + 1,
      notes: null,
      exercise_type: ex.exercise_type ?? "strength",
    });
    if (exErr || !newEx) continue;
    const pastSets = [...(setsPerExercise[i]?.data ?? [])].sort((a, b) => a.set_number - b.set_number);
    const template = pastSets.length > 0 ? pastSets.slice(0, 20) : [{ is_warmup: false }];
    await Promise.all(template.map((s: any, n: number) =>
      db.insertSessionExerciseSet({
        session_exercise_id: newEx.session_exercise_id,
        set_number: n + 1,
        weight: null,
        reps: null,
        is_warmup: s.is_warmup === true,
      })
    ));
  }
  return { sessionId: session.session_id, sessionName: session.session_name };
}

export type SaveAsRoutineDb = Pick<RepeatDb, "getWorkoutSession" | "getSessionExercises" | "getSessionExerciseSets"> & {
  insertRoutine: (r: { routine_name: string; description: string | null; user_id: string }) => Promise<DbResult>;
  insertRoutineExercise: (e: any) => Promise<DbResult>;
  insertRoutineExerciseSet: (s: any) => Promise<{ error: any }>;
  deleteRoutine: (routineId: number) => Promise<{ error: any }>;
};

type RoutineCopy = { exercise: any; sets: any[] };

// Writes the exercises and sets of a just-created routine. Any failed insert
// (a dropped signal mid-copy, or the offline refusal) deletes the routine and
// reports the error, so the user never gets a half-saved copy as a "success".
async function fillRoutine(
  db: Pick<SaveAsRoutineDb, "insertRoutineExercise" | "insertRoutineExerciseSet" | "deleteRoutine">,
  routineId: number,
  items: RoutineCopy[],
): Promise<{ routineId: number } | { error: string }> {
  const fail = async (err: any) => {
    const cleanup = await db.deleteRoutine(routineId).catch((e) => ({ error: e }));
    const why = err?.message ?? "Couldn't save every exercise.";
    // The delete can be refused too (signal gone); say so instead of
    // implying nothing was saved, so a retry doesn't leave two copies.
    return cleanup?.error
      ? { error: `${why} A partial copy was left in your routines; delete it before trying again.` }
      : { error: why };
  };
  for (let i = 0; i < items.length; i++) {
    const { exercise, sets } = items[i];
    const { data: rEx, error: exErr } = await db.insertRoutineExercise({ ...exercise, routine_id: routineId, exercise_order: i + 1 });
    if (exErr || !rEx) return fail(exErr);
    for (const set of sets) {
      const { error: setErr } = await db.insertRoutineExerciseSet({ ...set, routine_exercise_id: rEx.routine_exercise_id });
      if (setErr) return fail(setErr);
    }
  }
  return { routineId };
}

/**
 * "Save as Routine" (like Hevy): turn a finished workout into a routine.
 * The completed sets become the targets (all sets if none were checked off).
 */
export async function saveWorkoutAsRoutine(
  db: SaveAsRoutineDb,
  sessionId: number,
  userId: string,
  name: string,
): Promise<{ routineId: number } | { error: string }> {
  const [{ data: past }, { data: exercises }] = await Promise.all([
    db.getWorkoutSession(sessionId),
    db.getSessionExercises(sessionId),
  ]);
  if (!past) return { error: "Couldn't load that workout." };
  const ordered = [...(exercises ?? [])].sort((a, b) => a.exercise_order - b.exercise_order);
  const setsPerExercise = await Promise.all(ordered.map((ex) => db.getSessionExerciseSets(ex.session_exercise_id)));

  const { data: routine, error } = await db.insertRoutine({
    routine_name: name.trim() || past.session_name,
    description: null,
    user_id: userId,
  });
  if (error || !routine) return { error: error?.message ?? "Couldn't create the routine." };

  const items: RoutineCopy[] = ordered.map((ex, i) => {
    const all = [...(setsPerExercise[i]?.data ?? [])].sort((a, b) => a.set_number - b.set_number);
    const done = all.filter((s) => s.completed);
    const sets = (done.length > 0 ? done : all).slice(0, 20);
    const rows: any[] = sets.length > 0 ? sets : [{ is_warmup: false }];
    return {
      exercise: {
        exercise_id: ex.exercise_id,
        exercise_name: ex.exercise_name,
        exercise_type: ex.exercise_type ?? "strength",
      },
      sets: rows.map((s, n) => ({
        set_number: n + 1,
        target_weight: s.weight ?? null,
        target_reps: s.reps ?? null,
        is_warmup: s.is_warmup === true,
        target_duration_seconds: s.duration_seconds ?? null,
        target_distance_meters: s.distance_meters ?? null,
        target_effort_level: s.effort_level ?? null,
      })),
    };
  });
  return fillRoutine(db, routine.routine_id, items);
}

export type DuplicateRoutineDb = Pick<SaveAsRoutineDb, "insertRoutine" | "insertRoutineExercise" | "insertRoutineExerciseSet" | "deleteRoutine"> & {
  getRoutineExercises: (routineId: number) => Promise<DbResult<any[]>>;
  getRoutineExerciseSets: (routineExerciseId: number) => Promise<DbResult<any[]>>;
};

/** Copy a routine (exercises and target sets) under a new name. */
export async function duplicateRoutine(
  db: DuplicateRoutineDb,
  source: { routine_id: number; routine_name: string; description: string | null },
  userId: string,
): Promise<{ routineId: number } | { error: string }> {
  const { data: exercises, error: readErr } = await db.getRoutineExercises(source.routine_id);
  if (readErr) return { error: readErr.message ?? "Couldn't load that routine." };
  const ordered = [...(exercises ?? [])].sort((a, b) => a.exercise_order - b.exercise_order);
  const setsPer = await Promise.all(ordered.map((ex) => db.getRoutineExerciseSets(ex.routine_exercise_id)));
  const readFail = setsPer.find((r) => r?.error);
  if (readFail) return { error: readFail.error.message ?? "Couldn't load that routine." };

  const { data: routine, error } = await db.insertRoutine({
    routine_name: `${source.routine_name} (copy)`,
    description: source.description,
    user_id: userId,
  });
  if (error || !routine) return { error: error?.message ?? "Couldn't create the routine." };

  const items: RoutineCopy[] = ordered.map((ex, i) => ({
    exercise: {
      exercise_id: ex.exercise_id,
      exercise_name: ex.exercise_name,
      exercise_type: ex.exercise_type ?? "strength",
    },
    sets: [...(setsPer[i]?.data ?? [])].sort((a, b) => a.set_number - b.set_number).map((s) => ({
      set_number: s.set_number,
      target_weight: s.target_weight ?? null,
      target_reps: s.target_reps ?? null,
      is_warmup: !!s.is_warmup,
      target_duration_seconds: s.target_duration_seconds ?? null,
      target_distance_meters: s.target_distance_meters ?? null,
      target_effort_level: s.target_effort_level ?? null,
    })),
  }));
  return fillRoutine(db, routine.routine_id, items);
}
