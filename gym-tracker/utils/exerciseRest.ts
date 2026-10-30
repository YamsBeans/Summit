import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

/**
 * Per-exercise rest timer overrides, like Hevy's "Rest Timer" on each
 * exercise: heavy compounds can rest 3:00 while accessories use the default.
 * Keyed by exercise_id so the choice carries over to every future workout.
 * 0 means "no rest timer" for that exercise. Stored on the device only.
 */

const STORAGE_KEY = "@gym_tracker_exercise_rest";

export const REST_CHOICES = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300];

type RestMap = Record<string, number>;

let cache: RestMap = {};
let loaded = false;
const listeners = new Set<(m: RestMap) => void>();

function broadcast(m: RestMap) {
  cache = m;
  listeners.forEach((fn) => fn(m));
}

/** Validate whatever came out of storage; drop anything that isn't a sane duration. */
export function parseRestMap(raw: string | null): RestMap {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
    const out: RestMap = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 3600) out[k] = Math.round(v);
    }
    return out;
  } catch {
    return {};
  }
}

/** Rest for an exercise: its override if set, otherwise the global default. */
export function resolveRest(map: RestMap, exerciseId: string | null | undefined, fallback: number): number {
  if (exerciseId != null && Object.prototype.hasOwnProperty.call(map, exerciseId)) return map[exerciseId];
  return fallback;
}

/** "1:30", "2:00", "Off". */
export function formatRest(secs: number): string {
  if (secs <= 0) return "Off";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function useExerciseRest() {
  const [map, setMap] = useState<RestMap>(cache);

  useEffect(() => {
    listeners.add(setMap);
    if (!loaded) {
      AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
        loaded = true;
        broadcast(parseRestMap(raw));
      }).catch(() => {});
    }
    return () => { listeners.delete(setMap); };
  }, []);

  /** Set an override, or pass null to go back to the default. */
  const setRestFor = useCallback(async (exerciseId: string, secs: number | null) => {
    const next = { ...cache };
    if (secs == null) delete next[exerciseId];
    else next[exerciseId] = secs;
    broadcast(next);
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  }, []);

  return { restOverrides: map, setRestFor };
}
