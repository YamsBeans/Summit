type Session = { session_id: number; session_date: string; start_time?: string | null };
type Exercise = { session_exercise_id: number; exercise_id: string; exercise_type?: string | null };
type SetRow = { weight: number | null; completed?: boolean | null };

/**
 * How many exercises in each workout beat their heaviest weight from every
 * earlier workout, for the trophy on history cards (like Hevy's feed). Works
 * from history alone, so editing or deleting an old workout updates it. An
 * exercise's first workout sets the baseline and isn't counted, matching
 * Workout Complete and the live trophy.
 */
export function prCountsBySession(
  sessions: Session[],
  exercisesBySession: Record<number, Exercise[] | undefined>,
  setsByExercise: Record<number, SetRow[] | undefined>,
): Record<number, number> {
  const ordered = [...sessions].sort((a, b) =>
    a.session_date !== b.session_date ? (a.session_date < b.session_date ? -1 : 1)
    : (a.start_time ?? "") !== (b.start_time ?? "") ? ((a.start_time ?? "") < (b.start_time ?? "") ? -1 : 1)
    : a.session_id - b.session_id);
  const best = new Map<string, number>();
  const out: Record<number, number> = {};
  for (const s of ordered) {
    // The same exercise twice in one workout is judged once, on all its sets.
    const top = new Map<string, number>();
    for (const ex of exercisesBySession[s.session_id] ?? []) {
      if (ex.exercise_type === "cardio" || ex.exercise_type === "stretching") continue;
      for (const set of setsByExercise[ex.session_exercise_id] ?? []) {
        if (set.completed === false || set.weight == null || !(set.weight > 0)) continue;
        if (set.weight > (top.get(ex.exercise_id) ?? 0)) top.set(ex.exercise_id, set.weight);
      }
    }
    let count = 0;
    for (const [id, w] of top) {
      const prev = best.get(id);
      if (prev != null && w > prev) count++;
      if (prev == null || w > prev) best.set(id, w);
    }
    out[s.session_id] = count;
  }
  return out;
}
