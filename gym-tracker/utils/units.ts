import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

export type UnitSystem = "lbs" | "kg";
const STORAGE_KEY = "@gym_tracker_units";
const KG_FACTOR = 0.453592;

export function useUnits() {
  const [unit, setUnit] = useState<UnitSystem>("lbs");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val === "kg" || val === "lbs") setUnit(val);
    });
  }, []);

  const saveUnit = useCallback(async (u: UnitSystem) => {
    setUnit(u);
    await AsyncStorage.setItem(STORAGE_KEY, u);
  }, []);

  // toDisplay: converts stored lbs value to display unit
  const toDisplay = useCallback((lbs: number | null | undefined): number | null => {
    if (lbs == null) return null;
    return unit === "kg" ? Math.round((lbs * KG_FACTOR) * 10) / 10 : lbs;
  }, [unit]);

  // toStorage: converts display value back to lbs for storage
  const toStorage = useCallback((val: number | null | undefined): number | null => {
    if (val == null) return null;
    return unit === "kg" ? Math.round((val / KG_FACTOR) * 10) / 10 : val;
  }, [unit]);

  return { unit, saveUnit, toDisplay, toStorage, label: unit };
}