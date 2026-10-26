import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DEFAULT_DURATION = 90;
const STORAGE_KEY = "@gym_tracker_rest_duration";

export function useRestTimer() {
  const [remaining, setRemaining] = useState(0);
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val) setDuration(parseInt(val, 10));
    });
  }, []);

  const clear = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  const start = useCallback((secs?: number) => {
    const d = secs ?? duration;
    clear();
    setRemaining(d);
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clear();
          onCompleteRef.current?.();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
  }, [duration, clear]);

  const skip = useCallback(() => {
    clear();
    setRemaining(0);
  }, [clear]);

  const addTime = useCallback((secs: number) => {
    setRemaining((r) => r + secs);
  }, []);

  const setOnComplete = useCallback((fn: () => void) => {
    onCompleteRef.current = fn;
  }, []);

  const saveDuration = useCallback(async (secs: number) => {
    setDuration(secs);
    await AsyncStorage.setItem(STORAGE_KEY, String(secs));
  }, []);

  useEffect(() => () => clear(), [clear]);

  return { remaining, duration, start, skip, addTime, setOnComplete, saveDuration, isRunning: remaining > 0 };
}