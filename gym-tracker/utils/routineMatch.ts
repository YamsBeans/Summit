/**
 * Pair each session exercise with the routine exercise it came from.
 *
 * A routine can hold the same exercise more than once (e.g. heavy squats
 * first, back-off squats later). Keying by `exercise_id` alone let the last
 * instance win, so finishing the workout wrote both instances' sets into one
 * template and never updated the other. Instead, the Nth occurrence of an
 * exercise in the session (by `exercise_order`) maps to the Nth occurrence of
 * it in the routine. Exercises the routine doesn't contain are skipped.
 */
export function matchRoutineExercises<
  S extends { exercise_id: string; exercise_order?: number | null },
  R extends { exercise_id: string; exercise_order?: number | null },
>(sessionExercises: S[], routineExercises: R[]): [S, R][] {
  const byOrder = <T extends { exercise_order?: number | null }>(list: T[]) =>
    list.map((e, i) => ({ e, i })).sort(
      (a, b) => (a.e.exercise_order ?? a.i) - (b.e.exercise_order ?? b.i) || a.i - b.i,
    ).map(({ e }) => e);

  const queues = new Map<string, R[]>();
  for (const r of byOrder(routineExercises)) {
    const q = queues.get(r.exercise_id) ?? [];
    q.push(r);
    queues.set(r.exercise_id, q);
  }

  const pairs: [S, R][] = [];
  for (const s of byOrder(sessionExercises)) {
    const r = queues.get(s.exercise_id)?.shift();
    if (r) pairs.push([s, r]);
  }
  return pairs;
}
