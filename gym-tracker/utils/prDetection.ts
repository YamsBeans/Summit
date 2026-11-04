export type PRResult = {
  exerciseId: string;
  exerciseName: string;
  type: "weight" | "volume" | "both";
  newMax: number;
};

export type CardioPRResult = {
  exerciseId: string;
  exerciseName: string;
  bestDistanceMeters?: number;
  bestPaceSecPerKm?: number;
  bestDurationSeconds?: number;
};

type CurrentSet = {
  weight: number | null;
  reps: number | null;
  completed: boolean;
};

type PreviousRecord = {
  exercise_id: string;
  max_weight: number | null;
  max_volume: number | null;
  pr_type?: string | null;
};

/**
 * Detect cardio PRs for a single exercise in the just-finished session.
 * Returns a CardioPRResult with only the fields that improved, or null if no improvement.
 */
export function detectCardioPRs(
  exercise: { exercise_id: string; exercise_name: string },
  sets: Array<{ distance_meters?: number | null; duration_seconds?: number | null; pace_sec_per_km?: number | null; completed?: boolean }>,
  existingPR: { best_distance_meters?: number | null; best_pace_sec_per_km?: number | null; best_duration_seconds?: number | null } | null
): CardioPRResult | null {
  const completedSets = sets.filter((s) => s.completed !== false);
  if (completedSets.length === 0) return null;

  const maxDist = completedSets.reduce((m, s) => (s.distance_meters != null && s.distance_meters > m ? s.distance_meters : m), 0);
  const maxDur = completedSets.reduce((m, s) => (s.duration_seconds != null && s.duration_seconds > m ? s.duration_seconds : m), 0);
  const minPace = completedSets.reduce((m: number | null, s) => {
    const p = s.pace_sec_per_km;
    if (p == null || p <= 0) return m;
    return m === null || p < m ? p : m;
  }, null);

  const prevDist = existingPR?.best_distance_meters ?? 0;
  const prevDur = existingPR?.best_duration_seconds ?? 0;
  const prevPace = existingPR?.best_pace_sec_per_km ?? null;

  const distPR = maxDist > 0 && maxDist > prevDist;
  const durPR = maxDur > 0 && maxDur > prevDur;
  const pacePR = minPace != null && (prevPace === null || minPace < prevPace);

  if (!distPR && !durPR && !pacePR) return null;

  return {
    exerciseId: exercise.exercise_id,
    exerciseName: exercise.exercise_name,
    ...(distPR && { bestDistanceMeters: maxDist }),
    ...(pacePR && { bestPaceSecPerKm: minPace! }),
    ...(durPR && { bestDurationSeconds: maxDur }),
  };
}

/**
 * Merge every instance of the same exercise in a session into one entry so
 * an exercise logged twice (e.g. Bench early and again at the end) is judged
 * and saved once, on all of its sets.
 */
export function groupSetsByExercise<E extends { session_exercise_id: number; exercise_id: string }, S>(
  exercises: E[],
  exerciseSets: Record<number, S[]>,
): { exercise: E; sets: S[] }[] {
  const groups = new Map<string, { exercise: E; sets: S[] }>();
  for (const ex of exercises) {
    const sets = exerciseSets[ex.session_exercise_id] ?? [];
    const g = groups.get(ex.exercise_id);
    if (g) g.sets.push(...sets);
    else groups.set(ex.exercise_id, { exercise: ex, sets: [...sets] });
  }
  return [...groups.values()];
}

export function detectPRs(
  exercises: Array<{ session_exercise_id: number; exercise_id: string; exercise_name: string }>,
  exerciseSets: Record<number, CurrentSet[]>,
  previousRecords: PreviousRecord[]
): PRResult[] {
  const results: PRResult[] = [];
  // Cardio records share exercise ids' table; never compare strength sets to them.
  const prevMap = new Map(
    previousRecords.filter((r) => r.pr_type !== "cardio").map((r) => [r.exercise_id, r])
  );

  for (const { exercise: ex, sets: allSets } of groupSetsByExercise(exercises, exerciseSets)) {
    const sets = allSets.filter((s) => s.completed);
    if (sets.length === 0) continue;

    const maxWeight = sets.reduce((m, s) => (s.weight != null && s.weight > m ? s.weight : m), 0);
    const totalVolume = sets.reduce((sum, s) => {
      if (s.weight != null && s.reps != null) return sum + s.weight * s.reps;
      return sum;
    }, 0);

    const prev = prevMap.get(ex.exercise_id);
    const prevWeight = prev?.max_weight ?? 0;
    const prevVolume = prev?.max_volume ?? 0;

    const weightPR = maxWeight > prevWeight;
    const volumePR = totalVolume > prevVolume;

    if (weightPR || volumePR) {
      results.push({
        exerciseId: ex.exercise_id,
        exerciseName: ex.exercise_name,
        type: weightPR && volumePR ? "both" : weightPR ? "weight" : "volume",
        newMax: weightPR ? maxWeight : totalVolume,
      });
    }
  }

  return results;
}

/**
 * The record to store after a strength PR: the better of the previous record
 * and this session for each field. Writing this session's numbers directly
 * would let a volume PR on a light day overwrite the all-time heaviest lift.
 */
export function mergeStrengthRecord(
  sets: CurrentSet[],
  prev: { max_weight: number | null; max_volume: number | null } | null | undefined
): { max_weight: number | null; max_volume: number | null } {
  const done = sets.filter((s) => s.completed);
  const maxW = done.reduce((m, s) => (s.weight != null && s.weight > m ? s.weight : m), 0);
  const vol = done.reduce((sum, s) => (s.weight != null && s.reps != null ? sum + s.weight * s.reps : sum), 0);
  const bestW = Math.max(maxW, prev?.max_weight ?? 0);
  const bestVol = Math.max(vol, prev?.max_volume ?? 0);
  return { max_weight: bestW || null, max_volume: bestVol || null };
}

type StoredRecord = {
  max_weight?: number | null;
  max_volume?: number | null;
  best_distance_meters?: number | null;
  best_duration_seconds?: number | null;
  best_pace_sec_per_km?: number | null;
  [key: string]: any;
};

const higher = (a?: number | null, b?: number | null) =>
  a == null ? b ?? null : b == null ? a : Math.max(a, b);
const lower = (a?: number | null, b?: number | null) =>
  a == null || a <= 0 ? (b != null && b > 0 ? b : null) : b == null || b <= 0 ? a : Math.min(a, b);

/**
 * Combine a record about to be saved with what the server already has,
 * keeping the better value per field. A PR worked out offline from an old
 * (or missing) cached copy must never lower one set on another device.
 */
export function bestOfRecords<T extends StoredRecord>(incoming: T, existing: StoredRecord | null | undefined): T {
  if (!existing) return incoming;
  return {
    ...incoming,
    max_weight: higher(incoming.max_weight, existing.max_weight),
    max_volume: higher(incoming.max_volume, existing.max_volume),
    best_distance_meters: higher(incoming.best_distance_meters, existing.best_distance_meters),
    best_duration_seconds: higher(incoming.best_duration_seconds, existing.best_duration_seconds),
    best_pace_sec_per_km: lower(incoming.best_pace_sec_per_km, existing.best_pace_sec_per_km),
  };
}
