/**
 * Plate math for the plate calculator: which plates go on each side of the
 * bar to make a target weight. Works in the user's display unit.
 */
import type { UnitSystem } from "@/utils/units";

export const PLATES: Record<UnitSystem, number[]> = {
  lbs: [45, 35, 25, 10, 5, 2.5],
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
};

export const BARS: Record<UnitSystem, number[]> = {
  lbs: [45, 35, 15],
  kg: [20, 15, 10],
};

export type PlateResult = {
  /** Plates for ONE side, heaviest first. */
  perSide: number[];
  /** Weight actually loaded (bar + both sides). */
  loaded: number;
  /** Target minus loaded; > 0 when the target can't be made exactly. */
  remainder: number;
};

const round = (n: number) => Math.round(n * 1000) / 1000;

export function calculatePlates(target: number, bar: number, plates: number[]): PlateResult {
  if (!(target > bar)) return { perSide: [], loaded: bar, remainder: round(Math.max(0, target - bar)) };
  let side = round((target - bar) / 2);
  const perSide: number[] = [];
  for (const p of [...plates].sort((a, b) => b - a)) {
    while (side + 1e-9 >= p) {
      perSide.push(p);
      side = round(side - p);
    }
  }
  const loaded = round(bar + 2 * perSide.reduce((a, b) => a + b, 0));
  return { perSide, loaded, remainder: round(target - loaded) };
}

/** Group a side's plates for display: [[45, 2], [10, 1]]. */
export function groupPlates(perSide: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const p of perSide) {
    const last = out[out.length - 1];
    if (last && last[0] === p) last[1]++;
    else out.push([p, 1]);
  }
  return out;
}
