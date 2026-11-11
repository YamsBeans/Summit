import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { logError } from "./log";

const KEY = "@gym_tracker_keep_awake";
const TAG = "summit-workout";

// Shared across screens, so a change in Settings reaches an open workout.
let cached = true;
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

function load() {
  if (!loading) {
    loading = AsyncStorage.getItem(KEY)
      .then((v) => {
        // A toggle made while this was reading wins.
        if (!loaded) cached = v !== "off";
      })
      .catch(() => {})
      .finally(() => { loaded = true; notify(); });
  }
  return loading;
}

/**
 * "Keep Screen On" during workouts (like Strong and Hevy): the phone
 * dimming and locking between sets meant unlocking it to log every set.
 * On by default; stored on the device. Returns [on, set, loaded].
 */
export function useKeepAwakeSetting(): [boolean, (on: boolean) => void, boolean] {
  // Copied into state (not read from the module on render): the React
  // Compiler memoizes a hook's return value, so module variables read
  // during render went stale.
  const [state, setState] = useState({ on: cached, loaded });
  useEffect(() => {
    const fn = () => setState({ on: cached, loaded });
    fn();
    listeners.add(fn);
    load();
    return () => { listeners.delete(fn); };
  }, []);
  const save = useCallback((next: boolean) => {
    cached = next;
    loaded = true;
    notify();
    AsyncStorage.setItem(KEY, next ? "on" : "off").catch(() => {});
  }, []);
  return [state.on, save, state.loaded];
}

/** Keeps the screen on while `active` and the setting allow it. */
export function useWorkoutKeepAwake(active: boolean) {
  const [enabled, , ready] = useKeepAwakeSetting();
  // Wait for the saved setting, so "off" never flickers the lock on.
  const on = ready && active && enabled;
  useEffect(() => {
    if (!on) return;
    // On web the lock is only held once the request resolves; release it
    // after that, or a quick on→off would leave the screen on for good.
    // Not every platform can (some browsers have no Wake Lock); that's fine.
    const activation = activateKeepAwakeAsync(TAG).then(() => true, (e) => {
      logError("keepAwake.activate", e);
      return false;
    });
    return () => {
      activation.then((held) => {
        if (!held) return;
        try {
          const r: any = deactivateKeepAwake(TAG);
          r?.catch?.(() => {});
        } catch { /* already released */ }
      });
    };
  }, [on]);
}
