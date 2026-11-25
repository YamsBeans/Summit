/**
 * An exercise done twice in one workout (heavy squats, then back-offs) comes
 * back from history as two entries. Exercise detail showed them as two
 * sessions: two cards for one day and a chart that zig-zagged between the
 * top set and the back-off weight, with the same date twice on the axis.
 * Strong and Hevy show one session per workout, so the entries are merged,
 * keeping the blocks' sets in order.
 */
export function mergeSameSession<T extends { session_id?: number | null; session_date: string; sets: S[] }, S>(
  history: readonly T[],
): T[] {
  const out: T[] = [];
  const byId = new Map<number, T>();
  for (const h of history) {
    const existing = h.session_id != null ? byId.get(h.session_id) : undefined;
    if (existing) {
      existing.sets = [...existing.sets, ...h.sets];
      continue;
    }
    const copy = { ...h, sets: [...h.sets] };
    if (h.session_id != null) byId.set(h.session_id, copy);
    out.push(copy);
  }
  return out;
}
