/**
 * Month headers for the workout history (like Strong and Hevy):
 * "NOVEMBER 2026 · 12 workouts" above the first workout of each month.
 * Sessions are shown newest first; a month's header goes on its first one.
 */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

export type MonthHeader = { label: string; count: number };

/** "2026-11" from "2026-11-25" (the stored local date, no time zone shift). */
function monthKey(sessionDate: string): string {
  return (sessionDate ?? "").slice(0, 7);
}

function monthLabel(key: string, now: Date): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return "Earlier";
  // The current year reads cleaner without its number.
  return y === now.getFullYear() ? MONTHS[m - 1] : `${MONTHS[m - 1]} ${y}`;
}

/** Header to show above each session, keyed by index; undefined where none. */
export function historyMonthHeaders(
  sessions: readonly { session_date: string }[],
  now: Date = new Date(),
): (MonthHeader | undefined)[] {
  const counts = new Map<string, number>();
  for (const s of sessions) {
    const k = monthKey(s.session_date);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let prev: string | null = null;
  return sessions.map((s) => {
    const k = monthKey(s.session_date);
    if (k === prev) return undefined;
    prev = k;
    return { label: monthLabel(k, now), count: counts.get(k) ?? 0 };
  });
}
