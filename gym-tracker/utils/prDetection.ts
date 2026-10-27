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

export function detectPRs(
  exercises: Array<{ session_exercise_id: number; exercise_id: string; exercise_name: string }>,
  exerciseSets: Record<number, CurrentSet[]>,
  previousRecords: PreviousRecord[]
): PRResult[] {
  const results: PRResult[] = [];
  const prevMap = new Map(previousRecords.map((r) => [r.exercise_id, r]));

  for (const ex of exercises) {
    const sets = (exerciseSets[ex.session_exercise_id] ?? []).filter((s) => s.completed);
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
