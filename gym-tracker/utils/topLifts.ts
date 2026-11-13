import { bestOneRepMax } from "./oneRepMax";

export type LiftEntry = {
  /** Workout date, YYYY-MM-DD. */
  date: string;
  exerciseId: string;
  exerciseName?: string | null;
  exerciseType?: string | null;
  sets: { weight: number | null; reps: number | null; completed?: boolean | null; is_warmup?: boolean | null }[];
};

export type TopLift = {
  exerciseId: string;
  name: string;
  /** Best estimated 1RM (lbs) in the last 30 days, or the latest session's. */
  current: number;
  /** current minus the best est. 1RM from 30–90 days ago; null with no earlier data. */
  change: number | null;
  /** Best est. 1RM per session, oldest first (at most `points`). */
  series: number[];
  sessions: number;
};

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The lifts logged most in the last 90 days (at least two sessions each),
 * with their estimated 1RM trend, for the Profile "Top Lifts" card (like
 * Strong's and Hevy's strength-progress widgets). Warm-ups, unticked sets
 * and sets over 12 reps don't count toward the estimate.
 */
export function topLifts(entries: LiftEntry[], now: Date = new Date(), limit = 3, points = 12): TopLift[] {
  const ago = (days: number) => dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days));
  const since90 = ago(90);
  const since30 = ago(30);

  const byExercise = new Map<string, { name: string; points: { date: string; e1rm: number }[] }>();
  for (const e of entries) {
    if (e.exerciseType === "cardio" || e.exerciseType === "stretching") continue;
    const best = bestOneRepMax(e.sets.filter((s) => s.completed !== false));
    if (best == null) continue;
    const cur = byExercise.get(e.exerciseId) ?? { name: e.exerciseName ?? e.exerciseId, points: [] };
    if (e.exerciseName) cur.name = e.exerciseName;
    cur.points.push({ date: e.date.slice(0, 10), e1rm: best });
    byExercise.set(e.exerciseId, cur);
  }

  const lifts: TopLift[] = [];
  for (const [exerciseId, { name, points: all }] of byExercise) {
    // One point per day (the same lift twice in a workout counts once).
    const perDay = new Map<string, number>();
    for (const p of all) perDay.set(p.date, Math.max(perDay.get(p.date) ?? 0, p.e1rm));
    const days = [...perDay.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const recent = days.filter(([d]) => d >= since90);
    if (recent.length < 2) continue;
    const last30 = recent.filter(([d]) => d >= since30).map(([, v]) => v);
    const before = recent.filter(([d]) => d < since30).map(([, v]) => v);
    const current = last30.length > 0 ? Math.max(...last30) : recent[recent.length - 1][1];
    const change = last30.length > 0 && before.length > 0 ? Math.round((current - Math.max(...before)) * 10) / 10 : null;
    lifts.push({
      exerciseId,
      name,
      current,
      change,
      series: days.slice(-points).map(([, v]) => v),
      sessions: recent.length,
    });
  }
  lifts.sort((a, b) => b.sessions - a.sessions || b.current - a.current);
  return lifts.slice(0, limit);
}
