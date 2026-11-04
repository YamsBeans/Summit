// set_number bookkeeping shared by the workout logger, routine editor and
// workout editor. Sets are loaded ordered by set_number, and finishing a
// routine workout copies values back by set_number, so numbers must stay
// unique and match the on-screen order.

type Numbered = { set_number: number };

/** Number for a set appended to the end of the list. */
export function nextSetNumber(sets: readonly Numbered[]): number {
  return sets.reduce((max, s) => Math.max(max, s.set_number ?? 0), 0) + 1;
}

/**
 * The sets whose set_number has to change so the list reads 1..n in its
 * current order (e.g. after one in the middle was removed).
 */
export function renumberChanges<T extends Numbered>(sets: readonly T[]): { set: T; set_number: number }[] {
  const changes: { set: T; set_number: number }[] = [];
  sets.forEach((s, i) => {
    if (s.set_number !== i + 1) changes.push({ set: s, set_number: i + 1 });
  });
  return changes;
}

/** 1-based working-set number (warm-ups don't count), or null for a warm-up. */
export function workingSetNumber(sets: readonly { is_warmup?: boolean | null }[], index: number): number | null {
  if (sets[index]?.is_warmup) return null;
  let n = 0;
  for (let i = 0; i <= index && i < sets.length; i++) if (!sets[i].is_warmup) n++;
  return n;
}
