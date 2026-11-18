/**
 * The set to do after a rest (for the rest banner's "Next: …" line, like
 * Hevy). Looks at the exercise the rest started from first, then the ones
 * after it, then wraps round to any skipped earlier, so a skipped set
 * further up doesn't hijack "next".
 */
type Ex = { session_exercise_id: number };
type S = { completed?: boolean | null };

export function findNextSet<E extends Ex, T extends S>(
  exercises: readonly E[],
  setsByExercise: Record<number, readonly T[] | undefined>,
  fromExerciseId: number | null | undefined,
): { exercise: E; set: T; index: number } | null {
  if (exercises.length === 0) return null;
  const start = Math.max(0, exercises.findIndex((e) => e.session_exercise_id === fromExerciseId));
  for (let k = 0; k < exercises.length; k++) {
    const exercise = exercises[(start + k) % exercises.length];
    const sets = setsByExercise[exercise.session_exercise_id] ?? [];
    const index = sets.findIndex((s) => !s.completed);
    if (index >= 0) return { exercise, set: sets[index], index };
  }
  return null;
}
