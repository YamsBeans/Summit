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

/**
 * Volume (weight × reps) for display: whole numbers with separators. Converting
 * a lbs total to kg leaves noise like 800.1 for 8 × 100 kg, which nobody wants.
 */
export function formatVolume(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "0";
  return Math.round(v).toLocaleString();
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

// ─── Distance unit (cardio) ──────────────────────────────────────────────────
// Same pattern as the weight unit: one cached value shared by every screen,
// so changing it in Settings updates the workout, routine and profile screens
// that are already mounted (they used to read it once and keep a stale copy).

export type DistanceUnit = "km" | "mi";
const DISTANCE_KEY = "@gym_tracker_distance_unit";
let cachedDistance: DistanceUnit = "km";
const distanceListeners = new Set<(u: DistanceUnit) => void>();

function broadcastDistance(u: DistanceUnit) {
  cachedDistance = u;
  distanceListeners.forEach((fn) => fn(u));
}

export function useDistanceUnit() {
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>(cachedDistance);

  useEffect(() => {
    distanceListeners.add(setDistanceUnit);
    AsyncStorage.getItem(DISTANCE_KEY).then((val) => {
      const u: DistanceUnit = val === "mi" ? "mi" : "km";
      if (u !== cachedDistance) broadcastDistance(u);
      else setDistanceUnit(u);
    }).catch(() => {});
    return () => { distanceListeners.delete(setDistanceUnit); };
  }, []);

  const saveDistanceUnit = useCallback(async (u: DistanceUnit) => {
    broadcastDistance(u);
    await AsyncStorage.setItem(DISTANCE_KEY, u);
  }, []);

  return { distanceUnit, saveDistanceUnit };
}
