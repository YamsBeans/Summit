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

/**
 * Runs async jobs one after another per key (e.g. per exercise), so adding a
 * set waits for a delete's renumbering to land instead of reading the old
 * numbers back mid-way.
 */
export function createSerialQueue() {
  const tails = new Map<string | number, Promise<unknown>>();
  return function run<T>(key: string | number, job: () => Promise<T>): Promise<T> {
    const prev = tails.get(key) ?? Promise.resolve();
    const next = prev.then(job, job);
    const tail = next.catch(() => {});
    tails.set(key, tail);
    tail.then(() => { if (tails.get(key) === tail) tails.delete(key); });
    return next;
  };
}

/**
 * Last session's set to show in the PREVIOUS column for `sets[index]`, like
 * Hevy: warm-ups line up with last time's warm-ups and working sets with
 * working sets. Pairing by plain position put last time's first working set
 * next to today's first warm-up whenever the warm-up count changed.
 */
export function previousSetFor<P extends { is_warmup?: boolean | null }>(
  previous: readonly P[] | null | undefined,
  sets: readonly { is_warmup?: boolean | null }[],
  index: number,
): P | undefined {
  if (!previous || !sets[index]) return undefined;
  const warm = sets[index].is_warmup === true;
  let ordinal = 0;
  for (let i = 0; i < index; i++) if ((sets[i].is_warmup === true) === warm) ordinal++;
  return previous.filter((p) => (p.is_warmup === true) === warm)[ordinal];
}
