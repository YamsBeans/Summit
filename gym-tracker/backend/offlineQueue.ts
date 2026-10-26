import AsyncStorage from "@react-native-async-storage/async-storage";

const QUEUE_KEY = "@gym_tracker_offline_sessions";
const SESSION_ORIGIN_KEY = "@gym_tracker_active_session_origin";

export type PendingSession = {
  session: {
    routine_id: number | null;
    session_name: string;
    session_date: string;
    start_time: string;
    end_time: string | null;
    notes: string | null;
    user_id: string;
  };
  exercises: Array<{
    session_exercise_id: number; // local ID used to map sets
    exercise_id: string;
    exercise_name: string;
    exercise_order: number;
    notes: string | null;
  }>;
  sets: Array<{
    session_exercise_id: number; // local ID
    set_number: number;
    weight: number | null;
    reps: number | null;
    is_warmup: boolean;
    completed: boolean;
  }>;
};

export async function enqueuePendingSession(pending: PendingSession): Promise<void> {
  const existing = await getPendingQueue();
  existing.push(pending);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(existing));
}

export async function getPendingQueue(): Promise<PendingSession[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function removeFromQueue(indices: number[]): Promise<void> {
  const existing = await getPendingQueue();
  const remaining = existing.filter((_, i) => !indices.includes(i));
  if (remaining.length === 0) {
    await AsyncStorage.removeItem(QUEUE_KEY);
  } else {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  }
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