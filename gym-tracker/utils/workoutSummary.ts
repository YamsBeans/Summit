import { estimateOneRepMax } from "@/utils/oneRepMax";

/**
 * Builds the "Workout Complete" recap shown after Finish (like Strong/Hevy):
 * totals for the session plus one line per exercise with its best set.
 * Pure so it can be unit tested; all weights stay in stored lbs.
 */

type SummaryExercise = {
  session_exercise_id: number | string;
  exercise_id: string;
  exercise_name: string;
  exercise_type?: string | null;
};

type SummarySet = {
  weight?: number | null;
  reps?: number | null;
  completed?: boolean | null;
  is_warmup?: boolean | null;
  distance_meters?: number | null;
  duration_seconds?: number | null;
};

export type SummaryPR = { exerciseId: string; label: string };

export type ExerciseSummary = {
  exerciseId: string;
  name: string;
  isCardio: boolean;
  completedSets: number;
  /** Best working set by estimated 1RM (then weight, then reps). Weight in lbs. */
  bestSet: { weight: number | null; reps: number | null } | null;
  distanceMeters: number;
  durationSeconds: number;
  pr: string | null;
};

export type WorkoutSummary = {
  durationSeconds: number;
  totalVolumeLbs: number;
  completedSets: number;
  totalReps: number;
  exercises: ExerciseSummary[];
  prCount: number;
};

function setScore(s: SummarySet): [number, number, number] {
  const w = s.weight ?? 0;
  const r = s.reps ?? 0;
  return [estimateOneRepMax(w, r) ?? 0, w, r];
}

function better(a: [number, number, number], b: [number, number, number]) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

export function buildWorkoutSummary(
  exercises: SummaryExercise[],
  exerciseSets: Record<string | number, SummarySet[] | undefined>,
  prs: SummaryPR[],
  durationSeconds: number,
): WorkoutSummary {
  const prByExercise = new Map<string, string>();
  for (const pr of prs) {
    if (!prByExercise.has(pr.exerciseId)) prByExercise.set(pr.exerciseId, pr.label);
  }

  let totalVolumeLbs = 0;
  let completedSets = 0;
  let totalReps = 0;
  const rows: ExerciseSummary[] = [];

  for (const ex of exercises) {
    const sets = (exerciseSets[ex.session_exercise_id] ?? []).filter((s) => s.completed);
    const isCardio = ex.exercise_type === "cardio";
    let best: SummarySet | null = null;
    let distanceMeters = 0;
    let duration = 0;

    for (const s of sets) {
      completedSets++;
      if (isCardio) {
        distanceMeters += s.distance_meters ?? 0;
        duration += s.duration_seconds ?? 0;
        continue;
      }
      if (s.weight != null && s.reps != null) totalVolumeLbs += s.weight * s.reps;
      if (s.reps != null) totalReps += s.reps;
      if (s.is_warmup) continue;
      if (s.reps == null && s.weight == null) continue;
      if (!best || better(setScore(s), setScore(best))) best = s;
    }

    // Exercises with nothing completed aren't part of what was done.
    if (sets.length === 0) continue;

    rows.push({
      exerciseId: ex.exercise_id,
      name: ex.exercise_name,
      isCardio,
      completedSets: sets.length,
      bestSet: best ? { weight: best.weight ?? null, reps: best.reps ?? null } : null,
      distanceMeters,
      durationSeconds: duration,
      pr: prByExercise.get(ex.exercise_id) ?? null,
    });
  }

  return {
    durationSeconds: Math.max(0, Math.round(durationSeconds)),
    totalVolumeLbs,
    completedSets,
    totalReps,
    exercises: rows,
    prCount: rows.filter((r) => r.pr != null).length,
  };
}

/** "1h 05m", "42m", "45s" — compact duration for the recap. */
export function formatWorkoutDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}
