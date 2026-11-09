/**
 * Weekly streaks, like Hevy: a week (Sunday–Saturday, matching the profile's
 * This Week row) counts if it has at least one workout. Day streaks broke on
 * every rest day, so someone training Mon/Wed/Fri never got past "1 day".
 * The current week doesn't break the streak until it's over.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

const parse = (d: string) => {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, day);
};
const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The Sunday that starts the week containing `date` (local), as YYYY-MM-DD. */
export function weekStartOf(date: Date | string): string {
  const d = typeof date === "string" ? parse(date) : new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay());
  return fmt(d);
}

function prevWeek(weekStart: string): string {
  const d = parse(weekStart);
  d.setDate(d.getDate() - 7);
  return fmt(d);
}

export function weeklyStreaks(dates: Iterable<string>, today: Date = new Date()): { current: number; longest: number } {
  const weeks = new Set<string>();
  for (const d of dates) if (d) weeks.add(weekStartOf(d));
  if (weeks.size === 0) return { current: 0, longest: 0 };

  const sorted = [...weeks].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = prevWeek(sorted[i]) === sorted[i - 1] ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  let w = weekStartOf(today);
  if (!weeks.has(w)) w = prevWeek(w);
  let current = 0;
  while (weeks.has(w)) { current++; w = prevWeek(w); }
  return { current, longest };
}

/** Workouts logged in the week containing `today`. */
export function workoutsThisWeek(dates: Iterable<string>, today: Date = new Date()): number {
  const w = weekStartOf(today);
  let n = 0;
  for (const d of dates) if (d && weekStartOf(d) === w) n++;
  return n;
}

const GOAL_KEY = "@gym_tracker_weekly_goal";
export const GOAL_CHOICES = [1, 2, 3, 4, 5, 6, 7];

/** Workouts-per-week goal (1–7), or null for none. Stored on the device. */
export function useWeeklyGoal(): [number | null, (goal: number | null) => void] {
  const [goal, setGoal] = useState<number | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(GOAL_KEY).then((v) => {
      const n = Number(v);
      setGoal(GOAL_CHOICES.includes(n) ? n : null);
    }).catch(() => {});
  }, []);
  const save = useCallback((g: number | null) => {
    setGoal(g);
    (g == null ? AsyncStorage.removeItem(GOAL_KEY) : AsyncStorage.setItem(GOAL_KEY, String(g))).catch(() => {});
  }, []);
  return [goal, save];
}
