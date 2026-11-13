/**
 * Warm-up sets ramping up to a working weight, like Strong's warm-up
 * calculator: the empty bar for 10, then about 40% × 5, 60% × 3 and 80% × 2.
 * Weights are in the user's display unit and rounded down to loadable steps
 * (5 lb / 2.5 kg); steps that would repeat or reach the working weight are
 * dropped, so light working weights get fewer warm-ups.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import exercisesData from "@/assets/data/exercises.json";
import { BARS } from "@/utils/plates";
import type { UnitSystem } from "@/utils/units";

export type WarmupSet = { weight: number; reps: number };

const RAMP: { pct: number; reps: number }[] = [
  { pct: 0.4, reps: 5 },
  { pct: 0.6, reps: 3 },
  { pct: 0.8, reps: 2 },
];

export function warmupPlan(working: number, unit: UnitSystem, bar: number): WarmupSet[] {
  if (!(working > 0)) return [];
  const step = unit === "kg" ? 2.5 : 5;
  const plan: WarmupSet[] = [];
  let last = 0;
  if (bar > 0) {
    if (working <= bar) return [];
    plan.push({ weight: bar, reps: 10 });
    last = bar;
  }
  for (const { pct, reps } of RAMP) {
    const w = Math.floor((working * pct) / step + 1e-9) * step;
    if (w <= last || w >= working || w <= 0) continue;
    plan.push({ weight: w, reps });
    last = w;
  }
  return plan;
}

let equipmentById: Map<string, string | null> | null = null;

/** Whether an exercise is loaded on a straight barbell (library exercises only). */
export function usesBarbell(exerciseId: string): boolean {
  if (!equipmentById) {
    equipmentById = new Map(
      (exercisesData as { id: string; equipment?: string | null }[]).map((e) => [e.id, e.equipment ?? null]),
    );
  }
  return equipmentById.get(exerciseId) === "barbell";
}

/** Same key as the plate calculator, so warm-ups use the bar picked there. */
export const BAR_WEIGHT_KEY = "@gym_tracker_bar_weight";

export async function loadBarWeight(unit: UnitSystem): Promise<number> {
  try {
    const n = Number(await AsyncStorage.getItem(`${BAR_WEIGHT_KEY}_${unit}`));
    return BARS[unit].includes(n) ? n : BARS[unit][0];
  } catch {
    return BARS[unit][0];
  }
}
