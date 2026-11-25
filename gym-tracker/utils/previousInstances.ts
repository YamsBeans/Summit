/**
 * "Last time" when an exercise appears more than once in a workout (heavy
 * squats, then back-off squats). The previous workout's instances are kept
 * apart, in their order, and the Nth instance today is paired with the Nth
 * instance last time. Before, one of the two was picked at random, so the
 * PREVIOUS column could show back-off numbers beside the heavy sets.
 */

type InstanceRow = { session_exercise_id: number | string; exercise_order?: number | null };
type PrevSet = { session_exercise_id: number | string; set_number?: number | null };

function sortInstances<R extends InstanceRow>(rows: readonly R[]): R[] {
  return [...rows].sort((a, b) =>
    (a.exercise_order ?? 0) - (b.exercise_order ?? 0) || Number(a.session_exercise_id) - Number(b.session_exercise_id));
}

/** Sets grouped per session-exercise, ordered by exercise order, each sorted by set number. */
export function groupInstances<S extends PrevSet>(rows: readonly InstanceRow[], sets: readonly S[]): S[][] {
  return sortInstances(rows).map((r) =>
    sets
      .filter((s) => s.session_exercise_id === r.session_exercise_id)
      .sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0)));
}

/**
 * Last time's sets for today's Nth instance. With fewer instances last time,
 * the last one is reused (one squat block last time still hints both today).
 */
export function previousForInstance<S>(instances: readonly S[][] | null | undefined, n: number): S[] | undefined {
  return pickInstance(instances, n);
}

/** The Nth entry, or the last one when there are fewer. */
export function pickInstance<T>(list: readonly T[] | null | undefined, n: number): T | undefined {
  if (!list || list.length === 0) return undefined;
  return list[Math.min(Math.max(0, n), list.length - 1)];
}

/** Last time's note for each of today's session exercises ("seat 4"), paired like the sets. */
export function previousNoteBySessionExercise(
  exercises: readonly { session_exercise_id: number | string; exercise_id: string }[],
  notesByExercise: Record<string, readonly (string | null | undefined)[] | undefined>,
): Record<string, string | undefined> {
  const nums = instanceNumbers(exercises);
  const out: Record<string, string | undefined> = {};
  for (const ex of exercises) {
    const note = pickInstance(notesByExercise[ex.exercise_id], nums.get(ex.session_exercise_id) ?? 0)?.trim();
    if (note) out[String(ex.session_exercise_id)] = note;
  }
  return out;
}

/** Today's instance number of each session exercise (0 for the first squat block, 1 for the second). */
export function instanceNumbers(
  exercises: readonly { session_exercise_id: number | string; exercise_id: string }[],
): Map<number | string, number> {
  const seen = new Map<string, number>();
  const out = new Map<number | string, number>();
  for (const ex of exercises) {
    const n = seen.get(ex.exercise_id) ?? 0;
    out.set(ex.session_exercise_id, n);
    seen.set(ex.exercise_id, n + 1);
  }
  return out;
}

/** PREVIOUS-column sets keyed by today's session_exercise_id. */
export function previousBySessionExercise<S>(
  exercises: readonly { session_exercise_id: number | string; exercise_id: string }[],
  instancesByExercise: Record<string, S[][] | undefined>,
): Record<string, S[] | undefined> {
  const nums = instanceNumbers(exercises);
  const out: Record<string, S[] | undefined> = {};
  for (const ex of exercises) {
    out[String(ex.session_exercise_id)] = previousForInstance(instancesByExercise[ex.exercise_id], nums.get(ex.session_exercise_id) ?? 0);
  }
  return out;
}

/**
 * Last time's sets per exercise for the Workout Complete comparison. An
 * exercise done more than once last time has no like-for-like total, so it
 * gets none (today's side already skips exercises done twice).
 */
export function lastTimeForSummary<S>(instancesByExercise: Record<string, S[][] | undefined>): Record<string, S[] | undefined> {
  const out: Record<string, S[] | undefined> = {};
  for (const [id, inst] of Object.entries(instancesByExercise)) {
    const real = (inst ?? []).filter((s) => s.length > 0);
    out[id] = real.length === 1 ? real[0] : undefined;
  }
  return out;
}

/** Each instance's note, in the same order as groupInstances. */
export function instanceNotes(rows: readonly (InstanceRow & { notes?: string | null })[]): (string | null)[] {
  return sortInstances(rows).map((r) => r.notes ?? null);
}
