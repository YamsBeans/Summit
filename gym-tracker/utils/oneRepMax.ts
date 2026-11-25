/**
 * Estimated one-rep max (Epley): weight × (1 + reps / 30).
 *
 * This is the number Strong/Hevy chart as "Est. 1RM" — it lets a 5×225 day
 * and a 10×185 day be compared on one line. Estimates get unreliable past
 * ~12 reps, so higher-rep sets are ignored rather than inflating the chart.
 */
export const E1RM_MAX_REPS = 12;

export function estimateOneRepMax(weight: number | null | undefined, reps: number | null | undefined): number | null {
  if (weight == null || reps == null || !(weight > 0) || !(reps > 0)) return null;
  if (reps > E1RM_MAX_REPS) return null;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

type SetLike = { weight: number | null; reps: number | null; is_warmup?: boolean | null };

/** Best estimated 1RM among working (non-warmup) sets, or null. */
export function bestOneRepMax(sets: SetLike[]): number | null {
  let best: number | null = null;
  for (const s of sets) {
    if (s.is_warmup) continue;
    const e = estimateOneRepMax(s.weight, s.reps);
    if (e != null && (best == null || e > best)) best = e;
  }
  return best;
}
