/**
 * Pair each session exercise with the routine exercise it came from.
 *
 * A routine can hold the same exercise more than once (e.g. heavy squats
 * first, back-off squats later). Keying by `exercise_id` alone let the last
 * instance win, so finishing the workout wrote both instances' sets into one
 * template and never updated the other. Instead, the Nth occurrence of an
 * exercise in the session (by `exercise_order`) maps to the Nth occurrence of
 * it in the routine. Exercises the routine doesn't contain are skipped.
 *
 * Starting a routine copies each exercise's `exercise_order` into the
 * session, so an exact (exercise, position) match is paired first. That keeps
 * the back-off squats on the back-off template even when the heavy squats
 * were deleted mid-workout (otherwise they'd be the "first" squat and
 * overwrite the heavy targets). Whatever is left (exercises moved during the
 * workout) falls back to the Nth-occurrence pairing.
 */
export function matchRoutineExercises<
  S extends { exercise_id: string; exercise_order?: number | null },
  R extends { exercise_id: string; exercise_order?: number | null },
>(sessionExercises: S[], routineExercises: R[]): [S, R][] {
  const byOrder = <T extends { exercise_order?: number | null }>(list: T[]) =>
    list.map((e, i) => ({ e, i })).sort(
      (a, b) => (a.e.exercise_order ?? a.i) - (b.e.exercise_order ?? b.i) || a.i - b.i,
    ).map(({ e }) => e);

  const sessionSorted = byOrder(sessionExercises);
  const routineSorted = byOrder(routineExercises);
  const matched = new Map<S, R>();
  const usedRoutine = new Set<R>();

  const key = (e: { exercise_id: string; exercise_order?: number | null }) =>
    e.exercise_order == null ? null : `${e.exercise_id}\u0000${e.exercise_order}`;
  const exact = new Map<string, R>();
  for (const r of routineSorted) {
    const k = key(r);
    if (k != null && !exact.has(k)) exact.set(k, r);
  }
  for (const s of sessionSorted) {
    const k = key(s);
    const r = k == null ? undefined : exact.get(k);
    if (r && !usedRoutine.has(r)) { matched.set(s, r); usedRoutine.add(r); }
  }

  const queues = new Map<string, R[]>();
  for (const r of routineSorted) {
    if (usedRoutine.has(r)) continue;
    const q = queues.get(r.exercise_id) ?? [];
    q.push(r);
    queues.set(r.exercise_id, q);
  }

  const pairs: [S, R][] = [];
  for (const s of sessionSorted) {
    const r = matched.get(s) ?? queues.get(s.exercise_id)?.shift();
    if (r) pairs.push([s, r]);
  }
  return pairs;
}
