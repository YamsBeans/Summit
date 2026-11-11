import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { logError } from "./log";

const KEY = "@gym_tracker_keep_awake";
const TAG = "summit-workout";

// Shared across screens, so a change in Settings reaches an open workout.
let cached = true;
let loaded = false;
const listeners = new Set<(v: boolean) => void>();

/**
 * "Keep Screen On" during workouts (like Strong and Hevy): the phone
 * dimming and locking between sets meant unlocking it to log every set.
 * On by default; stored on the device.
 */
export function useKeepAwakeSetting(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(cached);
  useEffect(() => {
    listeners.add(setOn);
    if (!loaded) {
      AsyncStorage.getItem(KEY).then((v) => {
        loaded = true;
        cached = v !== "off";
        listeners.forEach((fn) => fn(cached));
      }).catch(() => {});
    }
    return () => { listeners.delete(setOn); };
  }, []);
  const save = useCallback((next: boolean) => {
    cached = next;
    loaded = true;
    listeners.forEach((fn) => fn(next));
    AsyncStorage.setItem(KEY, next ? "on" : "off").catch(() => {});
  }, []);
  return [on, save];
}

/** Keeps the screen on while `active` and the setting allow it. */
export function useWorkoutKeepAwake(active: boolean) {
  const [enabled] = useKeepAwakeSetting();
  const on = active && enabled;
  useEffect(() => {
    if (!on) return;
    // Not every platform can (some browsers have no Wake Lock); that's fine.
    activateKeepAwakeAsync(TAG).catch((e) => logError("keepAwake.activate", e));
    return () => {
      try {
        const r: any = deactivateKeepAwake(TAG);
        r?.catch?.(() => {});
      } catch { /* not supported */ }
    };
  }, [on]);
}
