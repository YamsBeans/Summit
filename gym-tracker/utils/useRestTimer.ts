import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DEFAULT_DURATION = 90;
const STORAGE_KEY = "@gym_tracker_rest_duration";
const TICK_MS = 250;

// The countdown is anchored to a wall-clock end time instead of decrementing a
// counter once per interval tick. JS timers are throttled or paused while the
// app is in the background (and drift under load), so a counter would show
// e.g. 1:10 left after you'd already rested for two minutes on another app.
//
// The active timer also lives at module level so it survives the workout
// screen unmounting when the user minimizes the workout and comes back.
let activeEndAt: number | null = null;
let activeTotal = 0;

function secondsLeft(endAt: number | null): number {
  if (endAt == null) return 0;
  return Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
}

/** Drop any running rest timer, e.g. when a workout is discarded from the minimized bar. */
export function clearActiveRestTimer() {
  activeEndAt = null;
  activeTotal = 0;
}

/** Test helper: forget any timer carried over between hook instances. */
export const __resetRestTimerForTests = clearActiveRestTimer;

export function useRestTimer() {
  const [remaining, setRemaining] = useState(() => secondsLeft(activeEndAt));
  const [total, setTotal] = useState(activeTotal);
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      const n = val ? parseInt(val, 10) : NaN;
      if (Number.isFinite(n) && n > 0) setDuration(n);
    }).catch(() => {});
  }, []);

  const clear = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  const tick = useCallback(() => {
    const left = secondsLeft(activeEndAt);
    setRemaining(left);
    if (left <= 0) {
      clear();
      if (activeEndAt != null) {
        activeEndAt = null;
        onCompleteRef.current?.();
      }
    }
  }, [clear]);

  const ensureTicking = useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(tick, TICK_MS);
  }, [tick]);

  const start = useCallback((secs?: number) => {
    const d = secs ?? duration;
    clear();
    activeEndAt = Date.now() + d * 1000;
    activeTotal = d;
    setTotal(d);
    setRemaining(d);
    ensureTicking();
  }, [duration, clear, ensureTicking]);

  const skip = useCallback(() => {
    clear();
    activeEndAt = null;
    setRemaining(0);
  }, [clear]);

  const addTime = useCallback((secs: number) => {
    if (activeEndAt == null) return; // nothing running — don't show a frozen banner
    activeEndAt += secs * 1000;
    activeTotal += secs;
    setTotal(activeTotal);
    setRemaining(secondsLeft(activeEndAt));
    ensureTicking();
  }, [ensureTicking]);

  const setOnComplete = useCallback((fn: () => void) => {
    onCompleteRef.current = fn;
  }, []);

  const saveDuration = useCallback(async (secs: number) => {
    setDuration(secs);
    await AsyncStorage.setItem(STORAGE_KEY, String(secs));
  }, []);

  // Resume a timer that was started before this instance mounted.
  useEffect(() => {
    if (secondsLeft(activeEndAt) > 0) ensureTicking();
    return () => clear();
  }, [ensureTicking, clear]);

  return { remaining, total, duration, start, skip, addTime, setOnComplete, saveDuration, isRunning: remaining > 0 };
}
