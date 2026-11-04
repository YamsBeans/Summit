// "Rep records" like Strong's Records tab: the heaviest weight you've done
// for each rep count, from finished workouts (working sets only).

type RepSet = { weight: number | null; reps: number | null; is_warmup?: boolean | null; completed?: boolean | null };

export type RepRecord = { reps: number; weight: number; date: string };

/**
 * One row per rep count up to `maxReps`. A rep count is left out when a
 * heavier weight was done for more reps (that set already beats it, e.g.
 * 200×5 makes a 190×3 "record" meaningless).
 */
export function buildRepRecords(
  history: { session_date: string; sets: RepSet[] }[],
  maxReps = 12,
): RepRecord[] {
  const best = new Map<number, RepRecord>();
  for (const h of history) {
    for (const s of h.sets) {
      if (s.is_warmup || s.completed === false) continue;
      const w = s.weight ?? 0;
      const r = s.reps ?? 0;
      if (!(w > 0) || !(r > 0) || r > maxReps) continue;
      const cur = best.get(r);
      // Ties keep the earliest date: that's when the record was set.
      if (!cur || w > cur.weight || (w === cur.weight && h.session_date < cur.date)) {
        best.set(r, { reps: r, weight: w, date: h.session_date });
      }
    }
  }
  const rows = [...best.values()].sort((a, b) => a.reps - b.reps);
  return rows.filter((row) => !rows.some((o) => o.reps > row.reps && o.weight >= row.weight));
}
