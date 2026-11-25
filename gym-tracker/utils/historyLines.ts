// One line per exercise on a history card, like Strong's "3 × Bench Press
// (Barbell) — 185 × 5": how many sets were done and the best one.

export type ExerciseLine = {
  name: string;
  /** Completed working sets (warm-ups left out). */
  sets: number;
  cardio: boolean;
  /** Best strength set, ranked by estimated 1RM (stored lbs). */
  best: { weight: number | null; reps: number | null } | null;
  /** Longest cardio set. */
  bestCardio: { distance_meters: number | null; duration_seconds: number | null } | null;
};

type SetRow = {
  weight?: number | null;
  reps?: number | null;
  is_warmup?: boolean | null;
  completed?: boolean | null;
  distance_meters?: number | null;
  duration_seconds?: number | null;
};

// Epley without the 12-rep cap: this only ranks sets, so 100 × 15 must still
// beat 60 × 5 (the capped estimate scored it as nothing).
const score = (w: number, r: number) => w * (1 + r / 30);

export function buildExerciseLine(
  ex: { exercise_name: string; exercise_type?: string | null },
  sets: SetRow[],
): ExerciseLine {
  const cardio = ex.exercise_type === "cardio";
  // null on older rows counts as done, as everywhere else in history.
  const done = sets.filter((s) => s.completed !== false && !s.is_warmup);
  let best: ExerciseLine["best"] = null;
  let bestCardio: ExerciseLine["bestCardio"] = null;
  if (cardio) {
    for (const s of done) {
      const d = s.distance_meters ?? 0;
      const t = s.duration_seconds ?? 0;
      if (d <= 0 && t <= 0) continue;
      const bd = bestCardio?.distance_meters ?? 0;
      const bt = bestCardio?.duration_seconds ?? 0;
      if (!bestCardio || d > bd || (d === bd && t > bt)) {
        bestCardio = { distance_meters: s.distance_meters ?? null, duration_seconds: s.duration_seconds ?? null };
      }
    }
  } else {
    let bestScore = -1;
    for (const s of done) {
      const w = s.weight ?? null;
      const r = s.reps ?? null;
      if (w == null && r == null) continue;
      // Weighted sets rank by estimated 1RM; bodyweight sets (no weight) by reps,
      // below any weighted set.
      const sc = w != null && w > 0 ? 1e6 + score(w, r ?? 1) : (r ?? 0);
      if (sc > bestScore || (sc === bestScore && (w ?? 0) > (best?.weight ?? 0))) {
        bestScore = sc;
        best = { weight: w, reps: r };
      }
    }
  }
  return { name: ex.exercise_name, sets: done.length, cardio, best, bestCardio };
}
