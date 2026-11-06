import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ExerciseType } from "./types";

const QUEUE_KEY = "@gym_tracker_offline_sessions";
const SESSION_ORIGIN_KEY = "@gym_tracker_active_session_origin";
const SYNCED_IDS_KEY = "@gym_tracker_synced_local_sessions";

// Every read-modify-write of the queue goes through this chain, so a workout
// finished while a sync is running can't be dropped by the sync writing back
// its older copy of the queue (or resurrect one that was just uploaded).
let queueLock: Promise<unknown> = Promise.resolve();
function withQueueLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queueLock.then(fn, fn);
  queueLock = run.catch(() => {});
  return run;
}

export type PendingSession = {
  /** The workout's on-device session_id (absent on entries from older builds). */
  local_session_id?: number;
  session: {
    routine_id: number | null;
    session_name: string;
    session_date: string;
    start_time: string;
    end_time: string | null;
    notes: string | null;
    user_id: string;
    photo_url?: string | null;
  };
  exercises: Array<{
    session_exercise_id: number; // local ID used to map sets
    exercise_id: string;
    exercise_name: string;
    exercise_order: number;
    notes: string | null;
    exercise_type: ExerciseType;
  }>;
  sets: Array<{
    session_exercise_id: number; // local ID
    set_number: number;
    weight: number | null;
    reps: number | null;
    is_warmup: boolean;
    completed: boolean;
    duration_seconds: number | null;
    distance_meters: number | null;
    pace_sec_per_km: number | null;
    calories: number | null;
    effort_level: number | null;
  }>;
};

export function enqueuePendingSession(pending: PendingSession): Promise<void> {
  return withQueueLock(async () => {
    const existing = await getPendingQueue();
    // Re-queuing the same offline workout replaces it rather than doubling it.
    const i = pending.local_session_id != null
      ? existing.findIndex((p) => p.local_session_id === pending.local_session_id)
      : -1;
    if (i >= 0) existing[i] = pending;
    else existing.push(pending);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(existing));
  });
}

/** Change the queued copy of an offline workout (e.g. a photo or notes added after finishing). */
export function updateQueuedSession(
  localSessionId: number,
  updates: Partial<PendingSession["session"]>,
): Promise<boolean> {
  return withQueueLock(async () => {
    const existing = await getPendingQueue();
    const entry = existing.find((p) => p.local_session_id === localSessionId);
    if (!entry) return false;
    entry.session = { ...entry.session, ...updates };
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(existing));
    return true;
  });
}

export async function getPendingQueue(): Promise<PendingSession[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function removeFromQueue(indices: number[]): Promise<void> {
  // Safe under the lock: new entries are only ever appended (or replace an
  // entry in place), so indices read at the start of a sync still match.
  return withQueueLock(async () => {
    const existing = await getPendingQueue();
    const remaining = existing.filter((_, i) => !indices.includes(i));
    if (remaining.length === 0) {
      await AsyncStorage.removeItem(QUEUE_KEY);
    } else {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    }
  });
}

// Offline workouts that have been uploaded: local session_id → server
// session_id. Lets a later change to the workout (photo, notes) reach the
// server copy, and tells start-up which local copies are safe to drop.
export async function getSyncedLocalSessions(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(SYNCED_IDS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function markLocalSessionsSynced(map: Record<number, number>): Promise<void> {
  return withQueueLock(async () => {
    const existing = await getSyncedLocalSessions();
    await AsyncStorage.setItem(SYNCED_IDS_KEY, JSON.stringify({ ...existing, ...map }));
  });
}

export async function getPendingCount(): Promise<number> {
  const queue = await getPendingQueue();
  return queue.length;
}

// Track whether the active workout session was started online or offline,
// so we know whether to queue it on finish or update Supabase directly.
export async function markSessionOrigin(sessionId: number, isLocal: boolean): Promise<void> {
  await AsyncStorage.setItem(SESSION_ORIGIN_KEY, JSON.stringify({ sessionId, isLocal }));
}

export async function getSessionOrigin(): Promise<{ sessionId: number; isLocal: boolean } | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_ORIGIN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function clearSessionOrigin(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_ORIGIN_KEY);
}

export function forgetSyncedLocalSessions(localIds: number[]): Promise<void> {
  if (localIds.length === 0) return Promise.resolve();
  return withQueueLock(async () => {
    const existing = await getSyncedLocalSessions();
    for (const id of localIds) delete existing[String(id)];
    await AsyncStorage.setItem(SYNCED_IDS_KEY, JSON.stringify(existing));
  });
}
