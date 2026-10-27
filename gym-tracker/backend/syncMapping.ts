import type { PendingSession } from "./offlineQueue";

type QueuedExercise = PendingSession["exercises"][number];
type QueuedSet = PendingSession["sets"][number];

export type InsertedExercise = { session_exercise_id: number };

export type RemappedSet = {
  session_exercise_id: number;
  set_number: number;
  weight: number | null;
  reps: number | null;
  is_warmup: boolean;
  completed: boolean;
  duration_seconds: number | null;
  distance_meters: number | null;
  pace_sec_per_km: number | null;
  calories: number | null;
  effort_level: number | null;
};

/**
 * Map each locally-queued exercise's temporary ID to the remote ID assigned on
 * insertion. Assumes `insertedExercises` is in the same order as
 * `localExercises` — PostgREST returns inserted rows in insertion order.
 */
export function buildExerciseIdMap(
  localExercises: QueuedExercise[],
  insertedExercises: InsertedExercise[]
): Record<number, number> {
  const map: Record<number, number> = {};
  insertedExercises.forEach((row, idx) => {
    const local = localExercises[idx];
    if (local) map[local.session_exercise_id] = row.session_exercise_id;
  });
  return map;
}

/**
 * Remap queued sets onto their newly-inserted remote exercise IDs, dropping any
 * set whose parent exercise is not in the map (e.g. its insert failed).
 */
export function remapSetsForInsert(
  sets: QueuedSet[],
  exIdMap: Record<number, number>
): RemappedSet[] {
  return sets
    .filter((s) => exIdMap[s.session_exercise_id] !== undefined)
    .map((s) => ({
      session_exercise_id: exIdMap[s.session_exercise_id],
      set_number: s.set_number,
      weight: s.weight,
      reps: s.reps,
      is_warmup: s.is_warmup,
      completed: s.completed,
      duration_seconds: s.duration_seconds,
      distance_meters: s.distance_meters,
      pace_sec_per_km: s.pace_sec_per_km,
      calories: s.calories,
      effort_level: s.effort_level,
    }));
}
