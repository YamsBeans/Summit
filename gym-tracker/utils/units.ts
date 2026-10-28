import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

export type UnitSystem = "lbs" | "kg";
const STORAGE_KEY = "@gym_tracker_units";
const KG_FACTOR = 0.453592;

// Every screen/row calls useUnits(), so keep the last known value at module
// level. New instances start from it instead of flashing "lbs" for a frame,
// and a change made in Settings reaches every mounted instance immediately.
let cachedUnit: UnitSystem = "lbs";
const listeners = new Set<(u: UnitSystem) => void>();

function broadcast(u: UnitSystem) {
  cachedUnit = u;
  listeners.forEach((fn) => fn(u));
}

/** Pure conversion helpers (weights are always stored in lbs). */
export function lbsToUnit(lbs: number | null | undefined, unit: UnitSystem): number | null {
  if (lbs == null) return null;
  return unit === "kg" ? Math.round((lbs * KG_FACTOR) * 10) / 10 : lbs;
}

export function unitToLbs(val: number | null | undefined, unit: UnitSystem): number | null {
  if (val == null) return null;
  return unit === "kg" ? Math.round((val / KG_FACTOR) * 10) / 10 : val;
}

export function useUnits() {
  const [unit, setUnit] = useState<UnitSystem>(cachedUnit);

  useEffect(() => {
    listeners.add(setUnit);
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      const u: UnitSystem = val === "kg" ? "kg" : "lbs";
      if (u !== cachedUnit) broadcast(u);
      else setUnit(u);
    }).catch(() => {});
    return () => { listeners.delete(setUnit); };
  }, []);

  const saveUnit = useCallback(async (u: UnitSystem) => {
    broadcast(u);
    await AsyncStorage.setItem(STORAGE_KEY, u);
  }, []);

  // toDisplay: converts stored lbs value to display unit
  const toDisplay = useCallback((lbs: number | null | undefined) => lbsToUnit(lbs, unit), [unit]);

  // toStorage: converts display value back to lbs for storage
  const toStorage = useCallback((val: number | null | undefined) => unitToLbs(val, unit), [unit]);

  return { unit, saveUnit, toDisplay, toStorage, label: unit };
}
