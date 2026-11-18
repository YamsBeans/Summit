/**
 * The most recent date (YYYY-MM-DD) each routine was finished, for the
 * "Last done" line on Home. Unfinished workouts don't count.
 */
export function lastDoneByRoutine(
  sessions: { routine_id?: number | null; session_date?: string | null; end_time?: string | null }[],
): Record<number, string> {
  const out: Record<number, string> = {};
  for (const s of sessions) {
    if (s.routine_id == null || !s.session_date || !s.end_time) continue;
    const prev = out[s.routine_id];
    if (!prev || s.session_date > prev) out[s.routine_id] = s.session_date;
  }
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "today", "yesterday", "3 days ago", "2 weeks ago", "Sep 14", "Sep 14, 2025". */
export function formatLastDone(date: string, now: Date = new Date()): string {
  const [y, m, d] = date.split("-").map(Number);
  const then = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((today.getTime() - then.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 35) return `${Math.floor(days / 7)} weeks ago`;
  return y === now.getFullYear() ? `on ${MONTHS[m - 1]} ${d}` : `on ${MONTHS[m - 1]} ${d}, ${y}`;
}

/**
 * Which routine is "Up next" on Home: of the routines in active rotation
 * (finished within the last `windowDays`), the one done longest ago. For a
 * Push/Pull/Legs split done in order that is the next day of the split, and
 * routines the user no longer does are ignored. Needs at least two routines
 * in rotation; ties go to the first in display order. Null when there's no
 * clear answer (fewer than two active, or everything was done today).
 */
export function nextUpRoutineId(
  orderedIds: number[],
  lastDone: Record<number, string>,
  now: Date = new Date(),
  windowDays = 42,
): number | null {
  const pad = (n: number) => String(n).padStart(2, "0");
  const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = dayKey(now);
  const cutoffDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - windowDays);
  const cutoff = dayKey(cutoffDate);
  const active = orderedIds.filter((id) => lastDone[id] && lastDone[id] >= cutoff);
  if (active.length < 2) return null;
  let best = active[0];
  for (const id of active) if (lastDone[id] < lastDone[best]) best = id;
  return lastDone[best] >= today ? null : best;
}
