import { MUSCLE_GROUPS, canonicalMuscle, type MuscleGroup } from "@/utils/exerciseSearch";

export type MuscleSplitRow = { key: MuscleGroup; label: string; sets: number };

export type SplitEntry = {
  /** Workout date, YYYY-MM-DD. */
  date: string;
  exerciseId: string;
  exerciseType?: string | null;
  sets: { completed?: boolean | null; is_warmup?: boolean | null }[];
};

/** The muscle group an exercise counts toward (its first primary muscle). */
export function muscleGroupFor(primaryMuscles: string[] | null | undefined): MuscleGroup | null {
  const raw = primaryMuscles?.[0]?.toLowerCase().trim();
  if (!raw) return null;
  // "Legs" / "Arms" name a group outright; anything else is one muscle,
  // possibly in gym shorthand ("Quads", "Bicep") on a custom exercise.
  const byName = MUSCLE_GROUPS.find((g) => g.key === raw || g.label.toLowerCase() === raw);
  if (byName) return byName.key;
  const first = canonicalMuscle(raw);
  for (const g of MUSCLE_GROUPS) {
    if (g.muscles.includes(first)) return g.key;
  }
  return null;
}

/**
 * Working sets per muscle group on or after `sinceDate` (like Hevy's muscle
 * distribution). Warm-ups, unticked sets, cardio and stretching don't count;
 * `completed = null` on older rows counts as done, as elsewhere in the app.
 * Every group is returned, in a fixed order, so gaps are visible.
 */
export function muscleSplit(
  entries: SplitEntry[],
  musclesOf: (exerciseId: string) => string[] | null | undefined,
  sinceDate: string,
): MuscleSplitRow[] {
  const counts = new Map<MuscleGroup, number>();
  for (const e of entries) {
    if (e.date < sinceDate) continue;
    if (e.exerciseType === "cardio" || e.exerciseType === "stretching") continue;
    const group = muscleGroupFor(musclesOf(e.exerciseId));
    if (!group) continue;
    const n = e.sets.filter((s) => s.completed !== false && s.is_warmup !== true).length;
    if (n > 0) counts.set(group, (counts.get(group) ?? 0) + n);
  }
  return MUSCLE_GROUPS.map((g) => ({ key: g.key, label: g.label, sets: counts.get(g.key) ?? 0 }));
}
