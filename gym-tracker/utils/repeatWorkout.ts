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
