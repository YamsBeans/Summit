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
  /**
   * Change vs the last time this exercise was done (like Strong's "vs last
   * time"): working-set volume, or total reps for bodyweight work. Null with
   * no comparable last time.
   */
  change: ExerciseChange | null;
};

export type ExerciseChange = { kind: "volume" | "reps"; /** This time minus last time (lbs or reps). */ diff: number; pct: number };

export type WorkoutSummary = {
  durationSeconds: number;
  totalVolumeLbs: number;
  completedSets: number;
  totalReps: number;
  totalDistanceMeters: number;
  exercises: ExerciseSummary[];
  prCount: number;
  /** Lifetime workout count including this one ("your 12th workout"), if known. */
  workoutNumber?: number | null;
  /**
   * Working-set volume vs last time, over the weighted exercises that have a
   * last time (so a new exercise doesn't count as "+100%"). Null if none.
   */
  volumeChangePct: number | null;
};

/** 1 → "1st", 12 → "12th", 22 → "22nd". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** This workout's number in the user's history: earlier finished workouts + 1. */
export function workoutNumberFrom(
  sessions: { session_id: number | string; end_time?: string | null }[] | null | undefined,
  currentSessionId: number | string,
): number | null {
  if (!sessions) return null;
  return sessions.filter((s) => s.session_id !== currentSessionId && s.end_time).length + 1;
}

/** Working (non-warm-up) weight × reps, and reps, of completed sets. */
function workTotals(sets: SummarySet[]) {
  let volume = 0;
  let reps = 0;
  let weighted = false;
  for (const s of sets) {
    if (s.is_warmup || s.completed === false) continue;
    if (s.reps != null) reps += s.reps;
    if (s.weight != null && s.weight > 0 && s.reps != null) {
      volume += s.weight * s.reps;
      weighted = true;
    }
  }
  return { volume, reps, weighted };
}

/** Compare this time's sets with last time's, or null if there's nothing to compare. */
export function compareWithLastTime(now: SummarySet[], last: SummarySet[] | null | undefined): ExerciseChange | null {
  if (!last || last.length === 0) return null;
  const a = workTotals(now);
  const b = workTotals(last);
  if (a.weighted && b.weighted) {
    return { kind: "volume", diff: a.volume - b.volume, pct: Math.round(((a.volume - b.volume) / b.volume) * 100) };
  }
  if (!a.weighted && !b.weighted && a.reps > 0 && b.reps > 0) {
    return { kind: "reps", diff: a.reps - b.reps, pct: Math.round(((a.reps - b.reps) / b.reps) * 100) };
  }
  return null;
}

function setScore(s: SummarySet): [number, number, number] {
  const w = s.weight ?? 0;
  const r = s.reps ?? 0;
  // Rank with the uncapped Epley formula: the charted estimate ignores sets
  // over 12 reps, which made 100×15 lose to 60×5 here.
  const est = estimateOneRepMax(w, r) ?? (w > 0 && r > 0 ? w * (1 + r / 30) : 0);
  return [est, w, r];
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
  /** Last session's completed sets per exercise_id (the logger's PREVIOUS column). */
  lastTime: Record<string, SummarySet[] | undefined> = {},
): WorkoutSummary {
  const prByExercise = new Map<string, string>();
  for (const pr of prs) {
    if (!prByExercise.has(pr.exerciseId)) prByExercise.set(pr.exerciseId, pr.label);
  }

  let totalVolumeLbs = 0;
  let completedSets = 0;
  let totalReps = 0;
  let totalDistanceMeters = 0;
  const rows: ExerciseSummary[] = [];
  const prShown = new Set<string>();
  // "Last time" is one session-exercise; an exercise done twice today (top
  // set + back-offs) has no like-for-like comparison, so it gets none.
  const timesToday = new Map<string, number>();
  for (const ex of exercises) {
    // An empty duplicate (added twice by mistake) doesn't count.
    if (!(exerciseSets[ex.session_exercise_id] ?? []).some((st) => st.completed)) continue;
    timesToday.set(ex.exercise_id, (timesToday.get(ex.exercise_id) ?? 0) + 1);
  }
  let volNow = 0;
  let volLast = 0;

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

    totalDistanceMeters += distanceMeters;
    // Exercises with nothing completed aren't part of what was done.
    if (sets.length === 0) continue;

    const change = !isCardio && timesToday.get(ex.exercise_id) === 1
      ? compareWithLastTime(sets, lastTime[ex.exercise_id])
      : null;
    if (change?.kind === "volume") {
      const now = workTotals(sets).volume;
      volNow += now;
      volLast += now - change.diff;
    }

    rows.push({
      exerciseId: ex.exercise_id,
      name: ex.exercise_name,
      isCardio,
      completedSets: sets.length,
      bestSet: best ? { weight: best.weight ?? null, reps: best.reps ?? null } : null,
      distanceMeters,
      durationSeconds: duration,
      // The same exercise twice (top set + back-offs) shares one PR: badge
      // the first row only, so the recap doesn't say "2 new PRs".
      pr: prShown.has(ex.exercise_id) ? null : prByExercise.get(ex.exercise_id) ?? null,
      change,
    });
    if (prByExercise.has(ex.exercise_id)) prShown.add(ex.exercise_id);
  }

  return {
    durationSeconds: Math.max(0, Math.round(durationSeconds)),
    totalVolumeLbs,
    completedSets,
    totalReps,
    totalDistanceMeters,
    exercises: rows,
    prCount: rows.filter((r) => r.pr != null).length,
    volumeChangePct: volLast > 0 ? Math.round(((volNow - volLast) / volLast) * 100) : null,
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
