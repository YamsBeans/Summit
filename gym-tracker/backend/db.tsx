import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { Platform } from "react-native";
import { supabase } from "./supabaseClient";
import { logError } from "@/utils/log";
import type { ExerciseType } from "./types";
import { localDb, isLocalId, loadLocalDb, finishedLocalSessionIds, removeLocalSessions } from "./localDb";
import { networkStatus } from "./networkStatus";
import {
  enqueuePendingSession,
  getPendingQueue,
  removeFromQueue,
  getPendingCount,
  markSessionOrigin,
  clearSessionOrigin,
  updateQueuedSession,
  getSyncedLocalSessions,
  markLocalSessionsSynced,
  forgetSyncedLocalSessions,
} from "./offlineQueue";
import { buildExerciseIdMap, remapSetsForInsert } from "./syncMapping";
import { bestOfRecords, strengthRecordDateFromHistory, strengthRecordFromHistory } from "@/utils/prDetection";
import { matchRoutineExercises, matchRoutineSets } from "@/utils/routineMatch";
import { fetchAllPages, fetchInChunks } from "./paging";
import { cachedRead, clearReadCache, isNetworkError, readCache, writeCache, writeCacheMany } from "./readCache";
import {
  OutboxOp,
  ExecuteResult,
  PRIMARY_KEY,
  enqueueOpHoldingLock,
  hasPendingOp,
  flushOutbox,
  hasPendingOps,
  inOutboxOrder,
  isTempId,
  newTempId,
  parkOps,
  pendingOpCount,
  resolveId,
  unparkOps,
  translateWithKnownIds,
} from "./outbox";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// isOnline = Supabase is configured (build-time check)
export const isOnline = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

// How progress photos are referenced in workout_sessions.photo_url.
const PROGRESS_PHOTO_PREFIX = "progress-photos/";
const LEGACY_PUBLIC_PHOTO_MARKER = "/storage/v1/object/public/progress-photos/";
const signedPhotoCache = new Map<string, { url: string; expiresAt: number }>();

// shouldUseSupabase = Supabase configured AND network available (runtime check)
const shouldUseSupabase = () => isOnline && networkStatus.isConnected;

// Routines, custom exercises and the profile have no offline outbox (only
// workouts do). Writing them to the on-device store while signed in to an
// account looked like it worked, but nothing ever synced it and reads come
// from the server cache, so the change silently vanished. Refuse instead.
export const OFFLINE_EDIT_MESSAGE = "You're offline. Changes to routines, exercises and your profile need a connection. Try again when you're back online.";
const offlineAccountWrite = () =>
  isOnline && !networkStatus.isConnected
    ? { data: null, error: { message: OFFLINE_EDIT_MESSAGE, offline: true } }
    : null;

// A workout started with no signal lives in the on-device store (local IDs)
// until it's finished and queued for sync. Calls about it must keep going
// there after the signal comes back; sending its local IDs to Supabase used
// to drop every set logged after reconnecting, and lost the whole workout
// when it was finished online.
const useSupabaseFor = (id: number | null | undefined) => shouldUseSupabase() && !isLocalId(id);

// Copy a finished offline workout (session, exercises, sets) into the sync
// queue. Returns the queued session row, or null if it isn't in the store.
async function queueLocalSession(sessionId: number) {
  const [{ data: session }, { data: exercises }] = await Promise.all([
    localDb.getWorkoutSession(sessionId),
    localDb.getSessionExercises(sessionId),
  ]);
  if (!session) return null;
  const sets = (
    await Promise.all((exercises ?? []).map(ex => localDb.getSessionExerciseSets(ex.session_exercise_id)))
  ).flatMap(r => r.data ?? []);
  await enqueuePendingSession({
    local_session_id: isLocalId(sessionId) ? sessionId : undefined,
    session: {
      routine_id: session.routine_id,
      session_name: session.session_name,
      session_date: session.session_date,
      start_time: session.start_time,
      end_time: session.end_time,
      notes: session.notes,
      user_id: session.user_id,
      photo_url: session.photo_url ?? null,
    },
    exercises: (exercises ?? []).map(ex => ({
      session_exercise_id: ex.session_exercise_id,
      exercise_id: ex.exercise_id,
      exercise_name: ex.exercise_name,
      exercise_order: ex.exercise_order,
      notes: ex.notes,
      exercise_type: ex.exercise_type,
    })),
    sets,
  });
  return session;
}

/**
 * Load the on-device store before the first screen reads it. In Supabase
 * builds, finished offline workouts are then dropped from it, but only once
 * they're safely queued or uploaded: one finished just before the app was
 * killed (before it reached the queue) is queued here first.
 */
export async function initLocalStore(): Promise<void> {
  await loadLocalDb();
  if (!isOnline) return;
  const finished = await finishedLocalSessionIds();
  if (finished.length === 0) return;
  const [queue, synced] = await Promise.all([getPendingQueue(), getSyncedLocalSessions()]);
  const inQueue = new Set(queue.map((p) => p.local_session_id));
  const safe: number[] = [];
  for (const id of finished) {
    if (inQueue.has(id) || synced[String(id)] != null) {
      safe.push(id);
      continue;
    }
    try {
      if (await queueLocalSession(id)) safe.push(id);
    } catch (e) {
      logError("initLocalStore.queue", e);
    }
  }
  await removeLocalSessions(safe);
  await forgetSyncedLocalSessions(safe.filter((id) => synced[String(id)] != null));
}

// A change to a finished offline workout (photo, notes, name). The local
// copy is updated; so is the queued copy, or the server copy once uploaded.
// Without this, a progress photo added on the summary screen was lost.
async function updateFinishedLocalSession(sessionId: number, updates: Record<string, any>) {
  if (!isOnline) return;
  if (await updateQueuedSession(sessionId, updates)) return;
  const serverId = (await getSyncedLocalSessions())[String(sessionId)];
  if (serverId != null && shouldUseSupabase()) {
    const { error } = await supabase.from("workout_sessions").update(updates).eq("session_id", serverId);
    if (error) logError("updateFinishedLocalSession", error);
  }
}

// One sync at a time: the start-up sync, the reconnect listener and a
// just-finished workout can all ask at once, and overlapping runs would
// upload the same queued workout twice. A request made while a run is going
// gets one more run afterwards, so a workout queued mid-sync isn't skipped.
let syncInFlight: Promise<{ synced: number; errors: number }> | null = null;
let syncAgain = false;

const OFFLINE_AUTH_ERROR = { message: "You're offline. Connect to the internet to sign in or create an account." };

// The session as saved on the device, read straight from auth storage.
// supabase.auth.getSession() returns null once the access token has expired
// and the refresh can't reach the server, which is the normal state an hour
// into being offline. The saved session is still the user's, so read it
// directly. It's removed on sign-out, so this never resurrects a signed-out
// user.
async function persistedSession(): Promise<any | null> {
  try {
    const key: string | undefined = (supabase.auth as any).storageKey;
    if (!key) return null;
    const raw = Platform.OS === "web"
      ? (typeof localStorage !== "undefined" ? localStorage.getItem(key) : null)
      : await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const session = parsed?.currentSession ?? parsed;
    return session?.user ? session : null;
  } catch {
    return null;
  }
}

// The signed-in Supabase user without a network round trip, so it keeps
// working in a basement gym.
async function sessionUser() {
  const { data } = await supabase.auth.getSession();
  if (data?.session?.user) return data.session.user;
  return (await persistedSession())?.user ?? null;
}

// Undo a half-uploaded queued workout so the next sync retries it cleanly
// instead of leaving an empty copy behind (and adding another each retry).
async function rollbackSyncedSession(sessionId: number) {
  try {
    const { data: exs } = await supabase.from("session_exercises").select("session_exercise_id").eq("session_id", sessionId);
    const ids = (exs ?? []).map((e: any) => e.session_exercise_id);
    if (ids.length > 0) await supabase.from("session_exercise_sets").delete().in("session_exercise_id", ids);
    await supabase.from("session_exercises").delete().eq("session_id", sessionId);
    await supabase.from("workout_sessions").delete().eq("session_id", sessionId);
  } catch (e) {
    logError("rollbackSyncedSession", e);
  }
}

/** The workout's start as a timestamp, or undefined to let the server default it. */
export function workoutTimestamp(date: string | null | undefined, time: string | null | undefined): string | undefined {
  if (!date) return undefined;
  const d = new Date(`${date}T${time || "00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

async function runPendingSync(userId: string): Promise<{ synced: number; errors: number }> {
  if (!isOnline) return { synced: 0, errors: 0 };
  // A sync asked for by an account that has since signed out (a run can
  // repeat after it was requested) must not put that account's parked
  // changes back under someone else's login.
  const current = await sessionUser().catch(() => null);
  if (current?.id !== userId) return { synced: 0, errors: 0 };
  // Changes this account made before signing out on this device come back first.
  await unparkOps(userId).catch((e) => logError("unparkOps", e));
  // Changes to server workouts made offline go first, in order.
  await flushNow();
  const [queue, alreadySynced] = await Promise.all([getPendingQueue(), getSyncedLocalSessions()]);
  if (queue.length === 0) return { synced: 0, errors: 0 };

  let synced = 0;
  let errors = 0;
  const successfulIndices: number[] = [];

  for (let i = 0; i < queue.length; i++) {
    const { session, exercises, sets } = queue[i];
    // Another account's workout, logged before it signed out on this device.
    // It waits for that account. It used to be uploaded into whoever was
    // signed in now.
    if (session.user_id && session.user_id !== userId) continue;
    // Uploaded already, but the app closed before the queue was trimmed.
    const localId = queue[i].local_session_id;
    if (localId != null && alreadySynced[String(localId)] != null) {
      successfulIndices.push(i);
      continue;
    }
    try {
      // Insert session row. created_at is when the workout happened, not when
      // it uploaded: history and the PREVIOUS column sort by it, so Monday's
      // offline workout uploaded on Friday showed up as the newest one.
      const { data: newSession, error: sessionErr } = await supabase
        .from("workout_sessions")
        .insert({ ...session, user_id: userId, created_at: workoutTimestamp(session.session_date, session.start_time) })
        .select()
        .single();
      if (sessionErr || !newSession) { errors++; continue; }

      // Insert all exercises in one request, then map local→remote IDs.
      let exIdMap: Record<number, number> = {};
      if (exercises.length > 0) {
        const { data: newExercises, error: exErr } = await supabase
          .from("session_exercises")
          .insert(exercises.map((ex) => ({
            session_id: newSession.session_id,
            exercise_id: ex.exercise_id,
            exercise_name: ex.exercise_name,
            exercise_order: ex.exercise_order,
            notes: ex.notes,
            exercise_type: ex.exercise_type,
          })))
          .select();
        if (exErr || !newExercises) {
        await rollbackSyncedSession(newSession.session_id);
        errors++;
        continue;
      }
        exIdMap = buildExerciseIdMap(exercises, newExercises);
      }

      // Insert sets with remapped exercise IDs
      const setsToInsert = remapSetsForInsert(sets, exIdMap);
      if (setsToInsert.length > 0) {
        const { error: setErr } = await supabase.from("session_exercise_sets").insert(setsToInsert);
        if (setErr) {
          // This used to be ignored: the workout counted as synced with no
          // sets, and the logged sets were gone for good.
          await rollbackSyncedSession(newSession.session_id);
          errors++;
          continue;
        }
      }

      successfulIndices.push(i);
      synced++;
      if (localId != null) await markLocalSessionsSynced({ [localId]: newSession.session_id });
    } catch {
      errors++;
    }
  }

  if (successfulIndices.length > 0) await removeFromQueue(successfulIndices);
  return { synced, errors };
}


// ─── Offline changes to server workouts ──────────────────────────────────────
// A workout that started online (or an old one being edited) keeps working
// with no signal: changes go to the outbox (outbox.ts) and the read cache is
// updated to match, so the screen shows what was logged. They used to be
// written to the empty local store and vanish.

// Which exercise a set belongs to, and which workout an exercise belongs to,
// learned from reads, so an offline change can update the right cached list.
const setParent = new Map<number, number>();
const exerciseParent = new Map<number, number>();

function rememberRows(rows: any) {
  for (const r of Array.isArray(rows) ? rows : rows ? [rows] : []) {
    if (r?.session_set_id != null && r.session_exercise_id != null) setParent.set(r.session_set_id, r.session_exercise_id);
    else if (r?.session_exercise_id != null && r.session_id != null) exerciseParent.set(r.session_exercise_id, r.session_id);
  }
}

async function patchCachedList(key: string, fn: (rows: any[]) => any[], createIfMissing = false) {
  const current = await readCache<any[]>(key);
  if (current == null && !createIfMissing) return;
  await writeCache(key, fn(Array.isArray(current) ? current : []));
}

async function patchCachedRow(key: string, values: Record<string, any>) {
  const current = await readCache<any>(key);
  if (current && typeof current === "object") await writeCache(key, { ...current, ...values });
}

// Send one change to Supabase. Network trouble → retry later; anything else
// is the server refusing it.
async function executeOp(op: OutboxOp): Promise<ExecuteResult & { row?: any }> {
  const pk = PRIMARY_KEY[op.table];
  const fail = (error: any, status?: number): ExecuteResult => ({
    ok: false,
    retry: isNetworkError(error),
    // Server trouble or a login that expired while offline: worth retrying
    // (a few times) rather than throwing the user's sets away.
    transient: (status ?? 0) >= 500 || /jwt|token|expired|PGRST301/i.test(`${error?.code ?? ""} ${error?.message ?? ""}`),
    error,
  });
  try {
    if (op.kind === "insert") {
      const { data, error, status } = await supabase.from(op.table).insert(op.values ?? {}).select().single();
      if (error || !data) return fail(error ?? { message: "Insert returned no row" }, status);
      return { ok: true, id: data[pk], row: data };
    }
    if (op.kind === "upsert") {
      let values = op.values ?? {};
      if (op.table === "personal_records") {
        // Merge with the server's row so a PR computed from a stale offline
        // copy can't overwrite a better one.
        const { data: existing, error: readErr, status: readStatus } = await supabase.from("personal_records")
          .select("*")
          .eq("user_id", values.user_id).eq("exercise_id", values.exercise_id).eq("pr_type", values.pr_type)
          .maybeSingle();
        if (readErr) return fail(readErr, readStatus);
        values = bestOfRecords(values, existing);
      }
      const { error, status } = await supabase.from(op.table).upsert(values, { onConflict: op.onConflict });
      return error ? fail(error, status) : { ok: true };
    }
    if (op.kind === "update") {
      const { error, status } = await supabase.from(op.table).update(op.values ?? {}).eq(pk, op.id);
      return error ? fail(error, status) : { ok: true };
    }
    // Delete children first (Supabase won't cascade unless the FK says so).
    if (op.table === "workout_sessions") {
      const { data: exercises, error } = await supabase.from("session_exercises")
        .select("session_exercise_id").eq("session_id", op.id);
      if (error) return fail(error);
      const exerciseIds = (exercises ?? []).map((ex: any) => ex.session_exercise_id);
      if (exerciseIds.length > 0) {
        const r = await supabase.from("session_exercise_sets").delete().in("session_exercise_id", exerciseIds);
        if (r.error) return fail(r.error);
      }
      const r = await supabase.from("session_exercises").delete().eq("session_id", op.id);
      if (r.error) return fail(r.error);
    } else if (op.table === "session_exercises") {
      const r = await supabase.from("session_exercise_sets").delete().eq("session_exercise_id", op.id);
      if (r.error) return fail(r.error);
    }
    const { error, status } = await supabase.from(op.table).delete().eq(pk, op.id);
    return error ? fail(error, status) : { ok: true };
  } catch (e) {
    // A thrown fetch is almost always no connection.
    return { ok: false, retry: true, error: e };
  }
}

const flushNow = () =>
  flushOutbox(executeOp, (op, error) => logError(`outbox dropped ${op.kind} ${op.table}`, error)).catch((e) => {
    logError("flushOutbox", e);
    return { done: 0, dropped: 0, remaining: -1 };
  });

const ROW_DEFAULTS: Record<string, Record<string, any>> = {
  session_exercise_sets: {
    completed: false, duration_seconds: null, distance_meters: null,
    pace_sec_per_km: null, calories: null, effort_level: null,
  },
  session_exercises: { notes: null, exercise_type: "strength" },
  workout_sessions: {},
  personal_records: {},
  routine_exercise_sets: {},
};

/**
 * Write a change to a server workout: straight to Supabase when it's
 * reachable and nothing is waiting in the outbox (so changes stay in order),
 * otherwise into the outbox, with `preview` updating the read cache.
 */
async function writeServerRow(
  op: OutboxOp,
  preview: (row: any) => Promise<void>,
): Promise<{ data: any; error: any }> {
  // One write at a time, in the same order as queued ones: otherwise an older
  // change that times out and gets queued could land after a newer one that
  // went straight through (weight 105 reverting to 100 on replay).
  const result = await inOutboxOrder(async () => {
    if (networkStatus.isConnected && !(await hasPendingOps())) {
      const ready = await translateWithKnownIds(op);
      if (ready) {
        const r = await executeOp(ready);
        if (r.ok) {
          rememberRows(r.row);
          // Keep the offline copy current too.
          await preview(r.row ?? null).catch(() => {});
          return { data: r.row ?? null, error: null, queued: false };
        }
        if (!r.retry) return { data: null, error: r.error, queued: false };
      }
    }
    const pk = PRIMARY_KEY[op.table];
    const tempId = op.kind === "insert" ? newTempId() : undefined;
    const row = op.kind === "insert" ? { ...ROW_DEFAULTS[op.table], ...op.values, [pk]: tempId } : null;
    rememberRows(row);
    await enqueueOpHoldingLock({ ...op, tempId }, () => preview(row));
    return { data: row, error: null, queued: true };
  });
  if (result.queued && networkStatus.isConnected) flushNow();
  return { data: result.data, error: result.error };
}

// Route by where a workout's rows live: the device store (local-only builds,
// and workouts started offline) or Supabase (directly or via the outbox).
const onDevice = (id: number | null | undefined) => !isOnline || isLocalId(id);

// A batch read also fills the per-workout / per-exercise cache entries, which
// are what offline edits patch and what's read while edits are waiting.
async function mirrorPerParent(rows: any, parentIds: number[], parentKey: string, prefix: string) {
  if (!Array.isArray(rows)) return;
  rememberRows(rows);
  // Only for small batches (one workout on the edit screen). The profile's
  // all-history batch would mean thousands of storage writes per visit.
  if (!shouldUseSupabase() || parentIds.length > 30) return;
  const byParent = new Map<number, any[]>(parentIds.map((id) => [id, []]));
  for (const r of rows) byParent.get(r[parentKey])?.push(r);
  await writeCacheMany([...byParent].map(([id, list]) => [`${prefix}:${id}`, list]));
}

// Every finished workout's completed sets for one exercise, oldest first.
// Errors are returned, never turned into an empty history.
async function fetchExerciseHistory(exerciseId: string, userId: string): Promise<{ data: any; error: any }> {
  const { data: sessionExercises, error: exError } = await fetchAllPages((from, to) => supabase
    .from("session_exercises")
    .select("session_exercise_id, workout_sessions!inner(session_id, session_date, end_time, user_id)")
    .eq("exercise_id", exerciseId)
    .eq("workout_sessions.user_id", userId)
    .not("workout_sessions.end_time", "is", null)
    .order("workout_sessions(session_date)", { ascending: true })
    .order("session_exercise_id", { ascending: true })
    .range(from, to));

  if (exError) return { data: null, error: exError };
  if (!sessionExercises || sessionExercises.length === 0) return { data: [], error: null };

  // One query for every session's sets instead of one request per past
  // workout (an exercise logged 100 times used to fire 100 requests).
  // Chunked so each request stays well under PostgREST's default
  // 1000-row cap and URL length limits on long histories.
  const ids = sessionExercises.map((se: any) => se.session_exercise_id);
  const setsRes = await fetchInChunks(ids, (chunk, from, to) =>
    supabase
      .from("session_exercise_sets")
      .select("*")
      .in("session_exercise_id", chunk)
      // Unticked sets weren't done; rows from before the flag existed are null.
      .or("completed.is.null,completed.eq.true")
      .order("set_number", { ascending: true })
      .order("session_set_id", { ascending: true })
      .range(from, to)
  );
  if (setsRes.error) return { data: null, error: setsRes.error };
  const allSets = setsRes.data ?? [];

  const setsByExercise = new Map<number, any[]>();
  for (const set of allSets ?? []) {
    const list = setsByExercise.get(set.session_exercise_id) ?? [];
    list.push(set);
    setsByExercise.set(set.session_exercise_id, list);
  }
  const history = sessionExercises.map((se: any) => ({
    session_id: se.workout_sessions.session_id,
    session_date: se.workout_sessions.session_date,
    sets: setsByExercise.get(se.session_exercise_id) ?? [],
  }));
  return { data: history, error: null };
}

// Exercises whose records need rebuilding once the server is up to date
// (an edit or delete made offline), per user.
const DIRTY_RECORDS_KEY = "@gym_tracker_records_dirty";

async function takeDirtyRecordIds(userId: string): Promise<string[]> {
  try {
    const all = JSON.parse((await AsyncStorage.getItem(DIRTY_RECORDS_KEY)) ?? "{}");
    return Array.isArray(all[userId]) ? all[userId] : [];
  } catch { return []; }
}

async function setDirtyRecordIds(userId: string, ids: string[]): Promise<void> {
  try {
    const all = JSON.parse((await AsyncStorage.getItem(DIRTY_RECORDS_KEY)) ?? "{}");
    if (ids.length > 0) all[userId] = [...new Set(ids)];
    else delete all[userId];
    await AsyncStorage.setItem(DIRTY_RECORDS_KEY, JSON.stringify(all));
  } catch (e) { logError("setDirtyRecordIds", e); }
}

const ACTIVE_SESSION_KEY = "activeSession";

// While offline changes are waiting to upload, the cached copy (which has
// them applied) is newer than the server's, so read that instead.
async function offlineCopyIsNewer(cacheKey: string): Promise<boolean> {
  if (!(await hasPendingOps())) return false;
  return (await readCache(cacheKey)) != null;
}
async function forgetCachedActiveSession(sessionId: number) {
  const cached = await readCache<any>(ACTIVE_SESSION_KEY);
  if (cached && cached.session_id === sessionId) await writeCache(ACTIVE_SESSION_KEY, false);
}

// Offline with Supabase configured: the routine only exists in the read
// cache (the in-memory local store is empty), so build the session from
// there. This used to fail with "Routine not found" even though the
// routine was right there on the home screen.
// Also used when the server can't be reached despite NetInfo (lie-fi).
// Null if the routine isn't cached.
// Reads only the cache: on lie-fi, going through cachedRead would wait on
// the dead connection again for every read.
async function startRoutineFromCache(routineId: number, userId: string): Promise<{ data: any; error: any } | null> {
  const [routines, routineExercises] = await Promise.all([
    readCache<any[]>("routines"),
    readCache<any[]>(`routineExercises:${routineId}`),
  ]);
  const routine = (routines ?? []).find((r: any) => r.routine_id === routineId);
  if (routine) {
    const { data: session, error } = await localDb.startWorkoutSession({
      routine_id: routineId,
      session_name: routine.routine_name,
      user_id: userId,
    });
    if (error || !session) return { data: null, error: error ?? { message: "Couldn't start the workout" } };
    const sorted = [...(routineExercises ?? [])].sort((a: any, b: any) => a.exercise_order - b.exercise_order);
    for (const ex of sorted) {
      const { data: sessionEx } = await localDb.insertSessionExercise({
        session_id: session.session_id,
        exercise_id: ex.exercise_id,
        exercise_name: ex.exercise_name,
        exercise_order: ex.exercise_order,
        notes: null,
        exercise_type: ex.exercise_type ?? "strength",
      });
      const templateSets = await readCache<any[]>(`routineExerciseSets:${ex.routine_exercise_id}`);
      const sets = [...(templateSets ?? [])].sort((a: any, b: any) => a.set_number - b.set_number);
      // No cached template (routine never opened online): start with one set.
      const rows = sets.length > 0 ? sets : [{ set_number: 1, is_warmup: false }];
      for (const ts of rows as any[]) {
        await localDb.insertSessionExerciseSet({
          session_exercise_id: sessionEx.session_exercise_id,
          set_number: ts.set_number,
          weight: ts.target_weight ?? null,
          reps: ts.target_reps ?? null,
          is_warmup: !!ts.is_warmup,
          duration_seconds: ts.target_duration_seconds ?? null,
          distance_meters: ts.target_distance_meters ?? null,
          effort_level: ts.target_effort_level ?? null,
        });
      }
    }
    await markSessionOrigin(session.session_id, true);
    return { data: session, error: null };
  }
  return null;
}

export const db = {
  // Auth
  signUp: async (email: string, password: string, username: string) => {
    if (shouldUseSupabase()) {
      // The public.users profile row is created by a database trigger (handle_new_user,
      // see supabase/migrations) from the username passed here as sign-up metadata.
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } },
      });
      if (signUpError) return { data: null, error: signUpError };
      return { data, error: null };
    }
    // With Supabase configured, an offline sign-up used to create a throwaway
    // local-only account whose workouts could never sync.
    if (isOnline) return { data: null, error: OFFLINE_AUTH_ERROR };
    return localDb.signUp(email, password, username);
  },

  signIn: async (email: string, password: string) => {
    if (shouldUseSupabase()) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error };
    }
    if (isOnline) return { error: OFFLINE_AUTH_ERROR };
    return localDb.signIn(email, password);
  },

  resetPassword: async (email: string) => {
    if (!shouldUseSupabase()) return { error: { message: "Requires internet connection to reset password." } };
    // The email link opens the reset-password screen (gymtracker://reset-password on
    // phones, <site>/reset-password on web). Both must be in Supabase's Redirect URLs.
    const redirectTo = Linking.createURL("/reset-password");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    return { error };
  },

  // Signs the user in from a password-recovery link so they can set a new password.
  // Handles both link styles Supabase can send: tokens in the #fragment, or a ?code=.
  recoverSessionFromUrl: async (url: string): Promise<{ error: string | null }> => {
    if (!shouldUseSupabase()) return { error: "Requires an internet connection." };
    try {
      const [beforeHash, hash = ""] = url.split("#");
      const query = beforeHash.includes("?") ? beforeHash.slice(beforeHash.indexOf("?") + 1) : "";
      const params = new URLSearchParams(query);
      new URLSearchParams(hash).forEach((value, key) => params.set(key, value));

      const linkError = params.get("error_description") ?? params.get("error");
      if (linkError) return { error: linkError.replace(/\+/g, " ") };

      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        return { error: error?.message ?? null };
      }

      const code = params.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        return { error: error?.message ?? null };
      }

      return { error: "This reset link is invalid or has expired. Request a new one." };
    } catch (e: any) {
      return { error: e?.message ?? "Couldn't open the reset link." };
    }
  },

  signOut: async () => {
    // Queued changes belong to this account: set them aside so the next
    // account to sign in here doesn't replay them (see parkOps).
    if (isOnline) {
      const user = await sessionUser().catch(() => null);
      if (user?.id) await parkOps(user.id).catch((e) => logError("parkOps", e));
    }
    if (shouldUseSupabase()) {
      await supabase.auth.signOut();
    } else if (isOnline) {
      // Offline: drop the session on this device (no server call needed), so
      // signing out actually signs out instead of silently doing nothing.
      await supabase.auth.signOut({ scope: "local" });
    } else {
      await localDb.signOut();
    }
    // Drop cached reads so the next user can't see the previous user's data.
    await clearReadCache();
  },

  // Auth state lives in Supabase's persisted session whenever Supabase is
  // configured, online or not. These used to switch to the in-memory local
  // store while offline, which has no user, so a signed-in user got
  // "Not authenticated" when starting a workout without signal.
  getSession: async () => {
    if (isOnline) {
      const res = await supabase.auth.getSession();
      if (res?.data?.session) return res;
      if (networkStatus.isConnected && !isNetworkError(res?.error)) return res;
      const saved = await persistedSession();
      return saved ? { data: { session: saved }, error: null } : res;
    }
    return localDb.getSession();
  },

  getUser: async () => {
    if (!isOnline) return localDb.getUser();
    if (networkStatus.isConnected) {
      try {
        const res = await supabase.auth.getUser();
        if (!res.error || !isNetworkError(res.error)) return res;
      } catch (e) {
        if (!isNetworkError(e)) throw e;
      }
    }
    return { data: { user: await sessionUser() }, error: null };
  },

  getUserProfile: async (userId: string) => {
    return cachedRead(
      shouldUseSupabase(),
      `userProfile:${userId}`,
      () => supabase.from("users").select("*").eq("user_id", userId).single(),
      () => localDb.getUserProfile(userId),
    );
  },

  updateUserProfile: async (userId: string, updates: { username?: string; bio?: string | null; avatar_url?: string | null }) => {
    const offline = offlineAccountWrite();
    if (offline) return offline;
    if (shouldUseSupabase()) {
      return supabase.from("users").update(updates).eq("user_id", userId);
    }
    return localDb.updateUserProfile(userId, updates);
  },

  uploadAvatar: async (userId: string, uri: string): Promise<{ url: string | null; error: string | null }> => {
    if (!shouldUseSupabase()) return { url: null, error: "Requires internet connection" };
    try {
      const ext = (uri.split(".").pop()?.split("?")[0]?.toLowerCase()) ?? "jpg";
      const mimeType = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : "image/jpeg";
      const path = `${userId}/avatar.${ext}`;
      // Use FormData instead of fetch().blob() — fetch() on local file:// / content://
      // URIs is unreliable on Android and often returns an empty blob.
      const formData = new FormData();
      formData.append("file", { uri, name: `avatar.${ext}`, type: mimeType } as any);
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, formData, { upsert: true, contentType: mimeType });
      if (uploadError) return { url: null, error: uploadError.message };
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      // Bust cache by appending a timestamp
      return { url: `${data.publicUrl}?t=${Date.now()}`, error: null };
    } catch (e: any) {
      return { url: null, error: e.message ?? "Upload failed" };
    }
  },

  uploadProgressPhoto: async (userId: string, sessionId: number, uri: string): Promise<{ url: string | null; error: string | null }> => {
    if (!shouldUseSupabase()) return { url: null, error: "Requires internet connection" };
    try {
      const ext = (uri.split(".").pop()?.split("?")[0]?.toLowerCase()) ?? "jpg";
      const mimeType = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : "image/jpeg";
      const path = `${userId}/${sessionId}.${ext}`;
      const formData = new FormData();
      formData.append("file", { uri, name: `progress.${ext}`, type: mimeType } as any);
      const { error: uploadError } = await supabase.storage
        .from("progress-photos")
        .upload(path, formData, { upsert: true, contentType: mimeType });
      if (uploadError) return { url: null, error: uploadError.message };
      // Progress photos are private. Save the storage path (not a public link);
      // getProgressPhotoUrl turns it into a short-lived signed link for display.
      // ?v= changes on every upload so a replaced photo isn't served from cache.
      return { url: `${PROGRESS_PHOTO_PREFIX}${path}?v=${Date.now()}`, error: null };
    } catch (e: any) {
      return { url: null, error: e.message ?? "Upload failed" };
    }
  },

  // Turns a saved photo_url into something an <Image> can show. Handles:
  //  - private storage paths ("progress-photos/<user>/<session>.jpg?v=..."), signed for 1 hour
  //  - older public links to the progress-photos bucket, which stop working once it's private
  //  - local file URIs saved while offline, returned unchanged
  getProgressPhotoUrl: async (photoUrl: string | null | undefined): Promise<string | null> => {
    if (!photoUrl) return null;

    let path: string | null = null;
    if (photoUrl.startsWith(PROGRESS_PHOTO_PREFIX)) {
      path = photoUrl.slice(PROGRESS_PHOTO_PREFIX.length);
    } else {
      const legacy = photoUrl.indexOf(LEGACY_PUBLIC_PHOTO_MARKER);
      if (legacy !== -1) path = photoUrl.slice(legacy + LEGACY_PUBLIC_PHOTO_MARKER.length);
    }
    if (path === null) return photoUrl; // local file or other URL
    path = path.split("?")[0];

    const cached = signedPhotoCache.get(photoUrl);
    if (cached && cached.expiresAt > Date.now()) return cached.url;
    if (!shouldUseSupabase()) return null;

    const { data, error } = await supabase.storage.from("progress-photos").createSignedUrl(path, 60 * 60);
    if (error || !data?.signedUrl) {
      logError("getProgressPhotoUrl", error);
      return null;
    }
    // Refresh a few minutes before Supabase's link expires.
    signedPhotoCache.set(photoUrl, { url: data.signedUrl, expiresAt: Date.now() + 55 * 60 * 1000 });
    return data.signedUrl;
  },

  updateSessionPhotoUrl: async (sessionId: number, photoUrl: string | null) => {
    // A server workout goes through the outbox like its name and notes. It
    // used to fall through to the device store while offline, which has no
    // such row: Remove Photo looked done and the photo came back later.
    if (!onDevice(sessionId)) {
      const values = { photo_url: photoUrl };
      return writeServerRow(
        { kind: "update", table: "workout_sessions", id: sessionId, values },
        () => patchCachedRow(`workoutSession:${sessionId}`, values),
      );
    }
    const result = await localDb.updateSessionPhotoUrl(sessionId, photoUrl);
    if (isLocalId(sessionId)) await updateFinishedLocalSession(sessionId, { photo_url: photoUrl });
    return result;
  },

  // Confirms the current password before a password change, so someone using an
  // unlocked phone can't lock the owner out. Re-signing in as the same user
  // just refreshes the session.
  verifyPassword: async (email: string, password: string): Promise<{ error: string | null }> => {
    if (!shouldUseSupabase()) return { error: "Requires an internet connection." };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? "Current password is incorrect." : null };
  },

  changePassword: async (newPassword: string) => {
    if (shouldUseSupabase()) {
      return supabase.auth.updateUser({ password: newPassword });
    }
    return { data: null, error: { message: "Password changes require an internet connection." } };
  },

  // Supabase emails a confirmation link to the new address (and, with "secure
  // email change" on, the old one too); the login email only changes once the
  // link is opened. The emailRedirectTo brings the user back into the app.
  changeEmail: async (newEmail: string) => {
    if (shouldUseSupabase()) {
      return supabase.auth.updateUser(
        { email: newEmail },
        { emailRedirectTo: Linking.createURL("/") },
      );
    }
    return { data: null, error: { message: "Changing your email requires an internet connection." } };
  },

  // Permanently deletes the signed-in user's data, photos and login.
  // Needs the delete_my_account() function from supabase/migrations.
  deleteAccount: async (): Promise<{ error: string | null }> => {
    if (!shouldUseSupabase()) {
      return { error: "Deleting your account requires an internet connection." };
    }
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) return { error: "You're not signed in." };

      // Storage files can't be deleted from SQL, so remove them through the Storage API first.
      for (const bucket of ["avatars", "progress-photos"]) {
        const { data: files } = await supabase.storage.from(bucket).list(userId, { limit: 1000 });
        if (files && files.length > 0) {
          const { error: removeError } = await supabase.storage
            .from(bucket)
            .remove(files.map((f: { name: string }) => `${userId}/${f.name}`));
          if (removeError) logError(`deleteAccount.remove.${bucket}`, removeError);
        }
      }

      const { error } = await supabase.rpc("delete_my_account");
      if (error) return { error: error.message };

      await supabase.auth.signOut().catch(() => {});
      await clearReadCache();
      await AsyncStorage.clear().catch(() => {});
      return { error: null };
    } catch (e: any) {
      return { error: e?.message ?? "Failed to delete account" };
    }
  },

  onAuthStateChange: (callback: (event: string, session: any) => void) => {
    if (isOnline) {
      return supabase.auth.onAuthStateChange(callback);
    }
    return localDb.onAuthStateChange(callback);
  },

  // Users
  getUsers: async () => {
    if (shouldUseSupabase()) {
      return supabase.from("users").select("*");
    }
    return localDb.getUsers();
  },

  // Routines
  getRoutines: async () => {
    return cachedRead(
      shouldUseSupabase(),
      "routines",
      () => supabase.from("routines").select("*"),
      () => localDb.getRoutines(),
    );
  },

  insertRoutine: async (routine: { routine_name: string; description: string | null; user_id: string }) => {
    const offline = offlineAccountWrite();
    if (offline) return offline;
    if (shouldUseSupabase()) {
      return supabase.from("routines").insert(routine).select().single();
    }
    return localDb.insertRoutine(routine);
  },

  updateRoutine: async (routineId: number, updates: { routine_name?: string; description?: string | null; routine_order?: number }) => {
    const offline = offlineAccountWrite();
    if (offline) return offline;
    if (shouldUseSupabase()) {
      return supabase.from("routines").update(updates).eq("routine_id", routineId);
    }
    return localDb.updateRoutine(routineId, updates);
  },

  deleteRoutine: async (routineId: number) => {
    const offline = offlineAccountWrite();
    if (offline) return offline;
    if (shouldUseSupabase()) {
      return supabase.from("routines").delete().eq("routine_id", routineId);
    }
    return localDb.deleteRoutine(routineId);
  },

  // Routine Exercises
  getRoutineExercises: async (routineId: number) => {
    return cachedRead(
      shouldUseSupabase(),
      `routineExercises:${routineId}`,
      () => supabase
        .from("routine_exercises")
        .select("*")
        .eq("routine_id", routineId)
        .order("exercise_order", { ascending: true }),
      () => localDb.getRoutineExercises(routineId),
    );
  },

  insertRoutineExercise: async (exercise: {
    routine_id: number;
    exercise_id: string;
    exercise_name: string;
    exercise_order: number;
    exercise_type?: 'strength' | 'cardio' | 'stretching';
  }) => {
    const offline = offlineAccountWrite();
    if (offline) return offline;
    if (shouldUseSupabase()) {
      return supabase.from("routine_exercises").insert({ exercise_type: 'strength', ...exercise }).select().single();
    }
    return localDb.insertRoutineExercise(exercise);
  },

  deleteRoutineExercise: async (routineExerciseId: number) => {
    const offline = offlineAccountWrite();
    if (offline) return offline;
    if (shouldUseSupabase()) {
      return supabase.from("routine_exercises").delete().eq("routine_exercise_id", routineExerciseId);
    }
    return localDb.deleteRoutineExercise(routineExerciseId);
  },

  updateRoutineExercise: async (routineExerciseId: number, updates: { exercise_id?: string; exercise_name?: string; exercise_type?: 'strength' | 'cardio' | 'stretching' }) => {
    const offline = offlineAccountWrite();
    if (offline) return offline;
    if (shouldUseSupabase()) {
      return supabase.from("routine_exercises").update(updates).eq("routine_exercise_id", routineExerciseId);
    }
    return localDb.updateRoutineExercise(routineExerciseId, updates);
  },

  // Routine Exercise Sets (template sets)
  getRoutineExerciseSets: async (routineExerciseId: number) => {
    return cachedRead(
      shouldUseSupabase(),
      `routineExerciseSets:${routineExerciseId}`,
      () => supabase
        .from("routine_exercise_sets")
        .select("*")
        .eq("routine_exercise_id", routineExerciseId)
        .order("set_number", { ascending: true }),
      () => localDb.getRoutineExerciseSets(routineExerciseId),
    );
  },

  insertRoutineExerciseSet: async (set: {
    routine_exercise_id: number;
    set_number: number;
    target_weight: number | null;
    target_reps: number | null;
    is_warmup: boolean;
    target_duration_seconds?: number | null;
    target_distance_meters?: number | null;
    target_effort_level?: number | null;
  }) => {
    const offline = offlineAccountWrite();
    if (offline) return offline;
    if (shouldUseSupabase()) {
      return supabase.from("routine_exercise_sets").insert(set);
    }
    return localDb.insertRoutineExerciseSet(set);
  },

  deleteRoutineExerciseSet: async (routineSetId: number) => {
    const offline = offlineAccountWrite();
    if (offline) return offline;
    if (shouldUseSupabase()) {
      return supabase.from("routine_exercise_sets").delete().eq("routine_set_id", routineSetId);
    }
    return localDb.deleteRoutineExerciseSet(routineSetId);
  },

  updateRoutineExerciseSet: async (
    routineSetId: number,
    updates: { set_number?: number; target_reps?: number | null; target_weight?: number | null; is_warmup?: boolean; target_duration_seconds?: number | null; target_distance_meters?: number | null; target_effort_level?: number | null }
  ) => {
    const offline = offlineAccountWrite();
    if (offline) return offline;
    if (shouldUseSupabase()) {
      return supabase
        .from("routine_exercise_sets")
        .update(updates)
        .eq("routine_set_id", routineSetId);
    }
    return localDb.updateRoutineExerciseSet(routineSetId, updates);
  },

  // Workout Sessions
  startWorkoutSession: async (params: { routine_id: number | null; session_name: string; user_id: string }) => {
    if (shouldUseSupabase()) {
      const now = new Date();
      const result = await supabase.from("workout_sessions").insert({
        routine_id: params.routine_id,
        session_name: params.session_name,
        session_date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
        start_time: now.toTimeString().split(" ")[0],
        user_id: params.user_id,
      }).select().single();
      if (result.data) {
        await markSessionOrigin(result.data.session_id, false);
        await writeCache(ACTIVE_SESSION_KEY, result.data);
      }
      return result;
    }
    const result = await localDb.startWorkoutSession(params);
    if (result.data) await markSessionOrigin(result.data.session_id, true);
    return result;
  },

  finishWorkoutSession: async (sessionId: number, notes?: string | null) => {
    if (!onDevice(sessionId)) {
      const values = { end_time: new Date().toTimeString().split(" ")[0], notes: notes ?? null };
      const result = await writeServerRow(
        { kind: "update", table: "workout_sessions", id: sessionId, values },
        async () => {
          await patchCachedRow(`workoutSession:${sessionId}`, values);
          await forgetCachedActiveSession(sessionId);
          // Show it in history right away, even before an offline finish uploads.
          const row = await readCache<any>(`workoutSession:${sessionId}`);
          if (row?.user_id) {
            await patchCachedList(`workoutSessions:${row.user_id}`, (rows) =>
              [{ ...row, ...values }, ...rows.filter((r) => r.session_id !== sessionId)]);
          }
        },
      );
      await clearSessionOrigin();
      // If the signal is back, upload everything before the caller reads the
      // routine and PRs back from the server.
      if (networkStatus.isConnected && (await hasPendingOps())) await flushNow();
      return result;
    }
    // Offline: finish locally then queue the full session tree for later sync
    const result = await localDb.finishWorkoutSession(sessionId, notes);
    // Logged offline in a Supabase build: queue it for upload.
    if (isOnline && isLocalId(sessionId)) {
      const queued = await queueLocalSession(sessionId);
      // Back online already? Upload it now rather than at the next reconnect.
      if (queued && shouldUseSupabase()) {
        db.syncPendingSessions(queued.user_id).catch((e: unknown) => logError("finishWorkoutSession.sync", e));
      }
    }
    await clearSessionOrigin();
    return result;
  },

  // Sync completed session sets back to the routine template targets.
  // Called after finishing a workout so the routine reflects what was actually done.
  syncSessionSetsToRoutine: async (sessionId: number, routineId: number) => {
    // A server workout with changes still queued (the finish flushed only
    // part way) isn't fully on the server yet: reading it there missed the
    // queued sets and exercises. Use the offline view and the outbox then.
    if (shouldUseSupabase() && (isLocalId(sessionId) || !(await hasPendingOps()))) {
      // A workout logged offline and finished after reconnecting is still in
      // the on-device store; the routine it updates is in Supabase.
      const sessionIsLocal = isLocalId(sessionId);
      // Fetch session exercises + routine exercises in parallel
      const [{ data: sessionExercises, error: seErr }, { data: routineExercises, error: reErr }] = await Promise.all([
        sessionIsLocal
          ? localDb.getSessionExercises(sessionId)
          : supabase.from("session_exercises").select("*").eq("session_id", sessionId),
        supabase.from("routine_exercises").select("*").eq("routine_id", routineId),
      ]);
      if (seErr || reErr) { logError("syncSessionSetsToRoutine.read", seErr ?? reErr); return; }
      if (!sessionExercises?.length || !routineExercises?.length) return;

      const sessionExIds = sessionExercises.map((e: any) => e.session_exercise_id);
      const routineExIds = routineExercises.map((e: any) => e.routine_exercise_id);

      // Fetch all sets in parallel
      const [{ data: sessionSets, error: ssErr }, { data: routineSets, error: rsErr }] = await Promise.all([
        sessionIsLocal
          ? Promise.all(sessionExIds.map((id: number) => localDb.getSessionExerciseSets(id)))
              .then((rs) => ({ data: rs.flatMap((r) => r.data ?? []), error: null }))
          : supabase.from("session_exercise_sets").select("*").in("session_exercise_id", sessionExIds),
        supabase.from("routine_exercise_sets").select("*").in("routine_exercise_id", routineExIds),
      ]);
      // A failed read must not pair sets against an empty list.
      if (ssErr || rsErr) { logError("syncSessionSetsToRoutine.read", ssErr ?? rsErr); return; }

      const updates: PromiseLike<any>[] = [];
      for (const [sessionEx, routineEx] of matchRoutineExercises<any, any>(sessionExercises, routineExercises)) {
        const pairs = matchRoutineSets<any, any>(
          (sessionSets ?? []).filter((s: any) => s.session_exercise_id === sessionEx.session_exercise_id),
          (routineSets ?? []).filter((rs: any) => rs.routine_exercise_id === routineEx.routine_exercise_id),
        );
        for (const [ss, rs] of pairs) {
          const routineSetId = rs.routine_set_id;

          const payload =
            sessionEx.exercise_type === "cardio"
              ? { target_distance_meters: ss.distance_meters ?? null, target_duration_seconds: ss.duration_seconds ?? null }
              : { target_weight: ss.weight ?? null, target_reps: ss.reps ?? null };

          updates.push(
            supabase.from("routine_exercise_sets").update(payload).eq("routine_set_id", routineSetId)
          );
        }
      }
      const results = await Promise.all(updates);
      const failed = results.find((r: any) => r?.error);
      if (failed) logError("syncSessionSetsToRoutine.update", failed.error);
      return;
    }

    if (isOnline) {
      // Signed in, but offline: the routine lives on the server. Read it from
      // the offline cache and queue the target updates in the outbox. Before,
      // this read the (empty) device store, so the routine silently kept last
      // time's numbers.
      const [{ data: sessionExercises }, { data: routineExercises }] = await Promise.all([
        db.getSessionExercises(sessionId),
        db.getRoutineExercises(routineId),
      ]);
      if (!sessionExercises?.length || !routineExercises?.length) return;
      for (const [sessionEx, routineEx] of matchRoutineExercises<any, any>(sessionExercises, routineExercises)) {
        const [{ data: sessionSets }, { data: routineSets }] = await Promise.all([
          db.getSessionExerciseSets(sessionEx.session_exercise_id),
          db.getRoutineExerciseSets(routineEx.routine_exercise_id),
        ]);
        for (const [ss, rs] of matchRoutineSets<any, any>(sessionSets ?? [], routineSets ?? [])) {
          const routineSetId = rs.routine_set_id;
          const values =
            sessionEx.exercise_type === "cardio"
              ? { target_distance_meters: ss.distance_meters ?? null, target_duration_seconds: ss.duration_seconds ?? null }
              : { target_weight: ss.weight ?? null, target_reps: ss.reps ?? null };
          await writeServerRow({ kind: "update", table: "routine_exercise_sets", id: routineSetId, values }, () =>
            patchCachedList(`routineExerciseSets:${routineEx.routine_exercise_id}`, (rows) =>
              rows.map((r) => (r.routine_set_id === routineSetId ? { ...r, ...values } : r))));
        }
      }
      return;
    }

    // Local-only mode — delegate row-by-row via existing updateRoutineExerciseSet
    const [{ data: sessionExercises }, { data: routineExercises }] = await Promise.all([
      localDb.getSessionExercises(sessionId),
      localDb.getRoutineExercises(routineId),
    ]);
    if (!sessionExercises?.length || !routineExercises?.length) return;

    for (const [sessionEx, routineEx] of matchRoutineExercises<any, any>(sessionExercises, routineExercises)) {

      const { data: sessionSets } = await localDb.getSessionExerciseSets(sessionEx.session_exercise_id);
      const { data: routineSets } = await localDb.getRoutineExerciseSets(routineEx.routine_exercise_id);
      for (const [ss, rs] of matchRoutineSets<any, any>(sessionSets ?? [], routineSets ?? [])) {
        const routineSetId = rs.routine_set_id;

        const payload =
          sessionEx.exercise_type === "cardio"
            ? { target_distance_meters: ss.distance_meters ?? null, target_duration_seconds: ss.duration_seconds ?? null }
            : { target_weight: ss.weight ?? null, target_reps: ss.reps ?? null };

        await localDb.updateRoutineExerciseSet(routineSetId, payload);
      }
    }
  },

  getWorkoutSessions: async (userId: string) => {
    return cachedRead(
      shouldUseSupabase(),
      `workoutSessions:${userId}`,
      // Every finished workout, not just the first 1000 rows.
      () => fetchAllPages((from, to) => supabase.from("workout_sessions")
        .select("*")
        .eq("user_id", userId)
        .not("end_time", "is", null)
        .order("created_at", { ascending: false })
        .order("session_id", { ascending: false })
        .range(from, to)),
      () => localDb.getWorkoutSessions(userId),
    );
  },

  getWorkoutSession: async (sessionId: number) => {
    if (isLocalId(sessionId)) return localDb.getWorkoutSession(sessionId);
    return cachedRead(
      shouldUseSupabase() && !(await offlineCopyIsNewer(`workoutSession:${sessionId}`)),
      `workoutSession:${sessionId}`,
      () => supabase.from("workout_sessions")
        .select("*")
        .eq("session_id", sessionId)
        .single(),
      () => localDb.getWorkoutSession(sessionId),
    );
  },

  getActiveSession: async (userId: string) => {
    // An unfinished offline workout wins: it's the one the user is in, and
    // Supabase doesn't know about it yet.
    const local = await localDb.getActiveSession(userId);
    if (local.data) return local;
    if (!isOnline) return local;
    // Cached too (including "none"), so a workout started online can still
    // be resumed after reopening the app in a gym with no signal.
    if (shouldUseSupabase()) {
      const res = await supabase.from("workout_sessions")
        .select("*")
        .eq("user_id", userId)
        .is("end_time", null)
        // Newest first and limit(1): maybeSingle() errors if a crash ever left
        // more than one unfinished session behind.
        .order("session_id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!res.error) {
        // Finished or discarded offline, but the server hasn't heard yet.
        const endedOffline = res.data && (await hasPendingOp((op) =>
          op.table === "workout_sessions" && op.id === res.data.session_id &&
          (op.kind === "delete" || op.values?.end_time != null)));
        const data = endedOffline ? null : res.data;
        await writeCache(ACTIVE_SESSION_KEY, data ?? false);
        return { ...res, data };
      }
      if (!isNetworkError(res.error)) return res;
    }
    const cached = await readCache<any>(ACTIVE_SESSION_KEY);
    return { data: cached && cached.user_id === userId ? cached : null, error: null };
  },

  updateWorkoutSession: async (sessionId: number, updates: { notes?: string | null; session_name?: string }) => {
    if (!onDevice(sessionId)) {
      return writeServerRow(
        { kind: "update", table: "workout_sessions", id: sessionId, values: updates },
        () => patchCachedRow(`workoutSession:${sessionId}`, updates),
      );
    }
    const result = await localDb.updateWorkoutSession(sessionId, updates);
    if (isLocalId(sessionId)) await updateFinishedLocalSession(sessionId, updates);
    return result;
  },

  deleteWorkoutSession: async (sessionId: number) => {
    if (!onDevice(sessionId)) {
      return writeServerRow(
        { kind: "delete", table: "workout_sessions", id: sessionId },
        async () => {
          await forgetCachedActiveSession(sessionId);
          // Otherwise an offline delete comes back on the next history load.
          const row = await readCache<any>(`workoutSession:${sessionId}`);
          const userId = row?.user_id ?? (await sessionUser().catch(() => null))?.id;
          if (userId) {
            await patchCachedList(`workoutSessions:${userId}`, (rows) => rows.filter((r) => r.session_id !== sessionId));
          }
        },
      );
    }
    return localDb.deleteWorkoutSession(sessionId);
  },

  // Session Exercises
  getSessionExercises: async (sessionId: number) => {
    if (isLocalId(sessionId)) return localDb.getSessionExercises(sessionId);
    const res = await cachedRead(
      shouldUseSupabase() && !(await offlineCopyIsNewer(`sessionExercises:${sessionId}`)),
      `sessionExercises:${sessionId}`,
      () => supabase.from("session_exercises")
        .select("*")
        .eq("session_id", sessionId)
        .order("exercise_order"),
      () => localDb.getSessionExercises(sessionId),
    );
    rememberRows(res.data);
    return res;
  },

  insertSessionExercise: async (exercise: { session_id: number; exercise_id: string; exercise_name: string; exercise_order: number; notes: string | null; exercise_type?: 'strength' | 'cardio' | 'stretching' }) => {
    if (!onDevice(exercise.session_id)) {
      return writeServerRow(
        { kind: "insert", table: "session_exercises", values: { exercise_type: "strength", ...exercise } },
        async (row) => {
          await patchCachedList(`sessionExercises:${exercise.session_id}`, (rows) => [...rows, row], true);
          await writeCache(`sessionExerciseSets:${row.session_exercise_id}`, []);
        },
      );
    }
    return localDb.insertSessionExercise(exercise);
  },

  deleteSessionExercise: async (sessionExerciseId: number) => {
    if (!onDevice(sessionExerciseId)) {
      return writeServerRow({ kind: "delete", table: "session_exercises", id: sessionExerciseId }, async () => {
        const sessionId = exerciseParent.get(sessionExerciseId);
        if (sessionId != null) {
          await patchCachedList(`sessionExercises:${sessionId}`, (rows) => rows.filter((r) => r.session_exercise_id !== sessionExerciseId));
        }
      });
    }
    return localDb.deleteSessionExercise(sessionExerciseId);
  },

  updateSessionExercise: async (sessionExerciseId: number, updates: { notes?: string; exercise_id?: string; exercise_name?: string; exercise_type?: ExerciseType; exercise_order?: number }) => {
    if (!onDevice(sessionExerciseId)) {
      return writeServerRow({ kind: "update", table: "session_exercises", id: sessionExerciseId, values: updates }, async () => {
        const sessionId = exerciseParent.get(sessionExerciseId);
        if (sessionId != null) {
          await patchCachedList(`sessionExercises:${sessionId}`, (rows) =>
            rows.map((r) => (r.session_exercise_id === sessionExerciseId ? { ...r, ...updates } : r)));
        }
      });
    }
    return localDb.updateSessionExercise(sessionExerciseId, updates);
  },

  // Session Exercise Sets
  getSessionExerciseSets: async (sessionExerciseId: number) => {
    if (isLocalId(sessionExerciseId)) return localDb.getSessionExerciseSets(sessionExerciseId);
    // An exercise added offline has a temporary ID: once uploaded, ask the
    // server under its real one; until then, only the offline view exists.
    const realId = isTempId(sessionExerciseId) ? await resolveId(sessionExerciseId) : sessionExerciseId;
    const res = await cachedRead(
      shouldUseSupabase() && realId != null && !(await offlineCopyIsNewer(`sessionExerciseSets:${sessionExerciseId}`)),
      `sessionExerciseSets:${sessionExerciseId}`,
      () => supabase.from("session_exercise_sets")
        .select("*")
        .eq("session_exercise_id", realId)
        .order("set_number"),
      async () => ({ data: [], error: null }),
    );
    rememberRows(res.data);
    return res;
  },

  insertSessionExerciseSet: async (set: { session_exercise_id: number; set_number: number; weight: number | null; reps: number | null; is_warmup: boolean; completed?: boolean; duration_seconds?: number | null; distance_meters?: number | null; pace_sec_per_km?: number | null; calories?: number | null; effort_level?: number | null }) => {
    if (!onDevice(set.session_exercise_id)) {
      return writeServerRow({ kind: "insert", table: "session_exercise_sets", values: set }, (row) =>
        patchCachedList(`sessionExerciseSets:${set.session_exercise_id}`, (rows) => [...rows, row], true),
      );
    }
    return localDb.insertSessionExerciseSet(set);
  },

  updateSessionExerciseSet: async (sessionSetId: number, updates: { set_number?: number; reps?: number | null; weight?: number | null; is_warmup?: boolean; completed?: boolean; duration_seconds?: number | null; distance_meters?: number | null; pace_sec_per_km?: number | null; calories?: number | null; effort_level?: number | null }) => {
    if (!onDevice(sessionSetId)) {
      return writeServerRow({ kind: "update", table: "session_exercise_sets", id: sessionSetId, values: updates }, async () => {
        const exId = setParent.get(sessionSetId);
        if (exId != null) {
          await patchCachedList(`sessionExerciseSets:${exId}`, (rows) =>
            rows.map((r) => (r.session_set_id === sessionSetId ? { ...r, ...updates } : r)));
        }
      });
    }
    return localDb.updateSessionExerciseSet(sessionSetId, updates);
  },

  deleteSessionExerciseSet: async (sessionSetId: number) => {
    if (!onDevice(sessionSetId)) {
      return writeServerRow({ kind: "delete", table: "session_exercise_sets", id: sessionSetId }, async () => {
        const exId = setParent.get(sessionSetId);
        if (exId != null) {
          await patchCachedList(`sessionExerciseSets:${exId}`, (rows) => rows.filter((r) => r.session_set_id !== sessionSetId));
        }
      });
    }
    return localDb.deleteSessionExerciseSet(sessionSetId);
  },

  // Start from routine (copies template → live session)
  startWorkoutFromRoutine: async (routineId: number, userId: string) => {
    if (shouldUseSupabase()) {
      // Round 1: fetch routine + exercises in parallel
      const [{ data: routine, error: routineErr }, { data: exercises, error: exListErr }] = await Promise.all([
        supabase.from("routines").select("*").eq("routine_id", routineId).single(),
        supabase.from("routine_exercises").select("*").eq("routine_id", routineId).order("exercise_order"),
      ]);
      // Can't reach the server even though NetInfo says connected: start from
      // the cached routine, like a phone that knows it's offline.
      if (isNetworkError(routineErr) || isNetworkError(exListErr)) {
        const cached = await startRoutineFromCache(routineId, userId);
        if (cached) return cached;
      }
      if (!routine) return { data: null, error: routineErr?.code === "PGRST116" || !routineErr ? { message: "Routine not found" } : routineErr };
      // A failed read used to start an empty workout as if the routine had
      // no exercises.
      if (exListErr) return { data: null, error: exListErr };

      const now = new Date();
      const routineExerciseIds = (exercises ?? []).map((e: any) => e.routine_exercise_id);

      // Round 2: create session + fetch all template sets in parallel
      const [{ data: session, error: sessionErr }, { data: allTemplateSets, error: templateErr }] = await Promise.all([
        supabase.from("workout_sessions").insert({
          routine_id: routineId,
          session_name: routine.routine_name,
          session_date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
          start_time: now.toTimeString().split(" ")[0],
          user_id: userId,
        }).select().single(),
        routineExerciseIds.length > 0
          ? supabase.from("routine_exercise_sets").select("*").in("routine_exercise_id", routineExerciseIds).order("set_number")
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (sessionErr) return { data: null, error: sessionErr };
      // Without the targets the workout would start with no sets, and the
      // cache refresh below would wipe the offline copy of every template.
      if (templateErr) {
        await db.deleteWorkoutSession(session.session_id).catch((e: unknown) => logError("startWorkoutFromRoutine.cleanup", e));
        if (isNetworkError(templateErr)) {
          const cached = await startRoutineFromCache(routineId, userId);
          if (cached) return cached;
        }
        return { data: null, error: templateErr };
      }

      if ((exercises ?? []).length === 0) return { data: session, error: null };

      // Round 3: batch insert all session exercises at once
      const exerciseInserts = (exercises ?? []).map((ex: any) => ({
        session_id: session.session_id,
        exercise_id: ex.exercise_id,
        exercise_name: ex.exercise_name,
        exercise_order: ex.exercise_order,
        notes: null,
        exercise_type: ex.exercise_type ?? 'strength',
      }));
      const { data: sessionExercises, error: exErr } = await supabase
        .from("session_exercises").insert(exerciseInserts).select();
      if (exErr) {
        // Don't leave an empty open session behind; it would come back as
        // "Resume <routine>" on the next launch.
        await db.deleteWorkoutSession(session.session_id).catch((e: unknown) => logError("startWorkoutFromRoutine.cleanup", e));
        return { data: null, error: exErr };
      }

      // Round 4: batch insert all sets at once. Match each new row to its
      // template by order and exercise, not by position: PostgREST doesn't
      // promise to return inserted rows in the order they were sent.
      const setInserts: any[] = [];
      const unmatched = [...(exercises ?? [])];
      (sessionExercises ?? []).forEach((sessionEx: any) => {
        const at = unmatched.findIndex((e: any) =>
          e.exercise_order === sessionEx.exercise_order && e.exercise_id === sessionEx.exercise_id);
        const origEx = at >= 0 ? unmatched.splice(at, 1)[0] : undefined;
        const templateSets = (allTemplateSets ?? []).filter(
          (ts: any) => ts.routine_exercise_id === origEx?.routine_exercise_id
        );
        for (const ts of templateSets) {
          setInserts.push({
            session_exercise_id: sessionEx.session_exercise_id,
            set_number: ts.set_number,
            weight: ts.target_weight ?? null,
            reps: ts.target_reps ?? null,
            is_warmup: ts.is_warmup,
            duration_seconds: ts.target_duration_seconds ?? null,
            distance_meters: ts.target_distance_meters ?? null,
            effort_level: ts.target_effort_level ?? null,
          });
        }
      });
      if (setInserts.length > 0) {
        const { error: setErr } = await supabase.from("session_exercise_sets").insert(setInserts);
        if (setErr) {
          // A workout with exercises but no sets isn't what the routine says;
          // undo it and let the user try again.
          logError("startWorkoutFromRoutine.sets", setErr);
          await db.deleteWorkoutSession(session.session_id).catch((e: unknown) => logError("startWorkoutFromRoutine.cleanup", e));
          return { data: null, error: setErr };
        }
      }

      // Keep the offline copy of this routine fresh so it can be started
      // without signal next time (see the offline path below).
      await writeCache(`routineExercises:${routineId}`, exercises ?? []);
      for (const ex of exercises ?? []) {
        await writeCache(
          `routineExerciseSets:${ex.routine_exercise_id}`,
          (allTemplateSets ?? []).filter((ts: any) => ts.routine_exercise_id === ex.routine_exercise_id),
        );
      }

      await markSessionOrigin(session.session_id, false);
      await writeCache(ACTIVE_SESSION_KEY, session);
      return { data: session, error: null };
    }
    if (isOnline) {
      const cached = await startRoutineFromCache(routineId, userId);
      if (cached) return cached;
    }
    const result = await localDb.startWorkoutFromRoutine(routineId, userId);
    if (result.data) await markSessionOrigin(result.data.session_id, true);
    return result;
  },

  // Previous performance hints
  getPreviousSessionSets: async (exerciseId: string, userId: string, excludeSessionId: number) => {
    if (shouldUseSupabase()) {
      const { data: prevEx } = await supabase
        .from("session_exercises")
        .select("session_exercise_id, workout_sessions!inner(session_id, user_id, end_time)")
        .eq("exercise_id", exerciseId)
        .eq("workout_sessions.user_id", userId)
        .not("workout_sessions.end_time", "is", null)
        .neq("workout_sessions.session_id", excludeSessionId)
        .order("workout_sessions(created_at)", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!prevEx) return { data: [], error: null };
      return supabase
        .from("session_exercise_sets")
        .select("*")
        .eq("session_exercise_id", prevEx.session_exercise_id)
        // Sets left unticked were never done; don't offer them as last time's numbers.
        .or("completed.is.null,completed.eq.true")
        .order("set_number");
    }
    return localDb.getPreviousSessionSets(exerciseId, userId, excludeSessionId);
  },

  // Personal Records
  getPersonalRecords: async (userId: string) => {
    return cachedRead(
      shouldUseSupabase(),
      `personalRecords:${userId}`,
      () => supabase.from("personal_records").select("*").eq("user_id", userId),
      () => localDb.getPersonalRecords(userId),
    );
  },

  upsertPersonalRecord: async (record: {
    user_id: string;
    exercise_id: string;
    max_weight: number | null;
    max_volume: number | null;
    pr_type?: 'strength' | 'cardio';
    best_distance_meters?: number | null;
    best_pace_sec_per_km?: number | null;
    best_duration_seconds?: number | null;
  }) => {
    if (isOnline) {
      // Offline (or no signal), the PR is queued and shown from the cache;
      // it used to be written to the device store and never reach Supabase.
      const values = { pr_type: "strength", ...record };
      return writeServerRow(
        { kind: "upsert", table: "personal_records", values, onConflict: "user_id,exercise_id,pr_type" },
        () => patchCachedList(`personalRecords:${record.user_id}`, (rows) => {
          const i = rows.findIndex((r) => r.exercise_id === values.exercise_id && (r.pr_type ?? "strength") === values.pr_type);
          if (i < 0) return [...rows, values];
          const next = [...rows];
          next[i] = bestOfRecords(values, next[i]);
          return next;
        }),
      );
    }
    return localDb.upsertPersonalRecord(record);
  },

  /**
   * Recompute strength records for these exercises from history, allowing
   * them to go down. Call after a finished workout is edited or deleted.
   * Lowering a record needs an up-to-date server, so this does nothing when
   * offline or while changes are still waiting to upload (normal PR saves
   * only ever raise a record).
   */
  rebuildStrengthRecords: async (userId: string, exerciseIds: string[]): Promise<void> => {
    const ids = [...new Set(exerciseIds)].filter(Boolean);

    if (!isOnline) {
      // Local-only: the device store is the whole truth.
      for (const exerciseId of ids) {
        const { data: history } = await localDb.getExerciseHistory(exerciseId, userId);
        const rebuilt = strengthRecordFromHistory((history ?? []) as any[]);
        const { data: records } = await localDb.getPersonalRecords(userId);
        const current = (records ?? []).find((r: any) => r.exercise_id === exerciseId && (r.pr_type ?? "strength") === "strength");
        if (!current && rebuilt.max_weight == null && rebuilt.max_volume == null) continue;
        if (current && current.max_weight === rebuilt.max_weight && current.max_volume === rebuilt.max_volume) continue;
        const achieved_at = strengthRecordDateFromHistory((history ?? []) as any[]);
        await localDb.upsertPersonalRecord({ user_id: userId, exercise_id: exerciseId, pr_type: "strength", ...rebuilt, ...(achieved_at ? { achieved_at } : {}) });
      }
      return;
    }

    // Anything left over from an edit made offline goes along too; whatever
    // can't be done now is kept for the next sync.
    const wanted = [...new Set([...(await takeDirtyRecordIds(userId)), ...ids])];
    if (wanted.length === 0) return;
    let done = false;
    const deferRest = () => setDirtyRecordIds(userId, done ? [] : wanted);
    if (!shouldUseSupabase()) { await deferRest(); return; }
    if (await hasPendingOps()) await flushNow();
    // Inside the outbox lock so no other write lands between reading the
    // history and writing the record; straight from Supabase (never the read
    // cache) and abandoned on any error, since this may lower a record.
    await inOutboxOrder(async () => {
      if (!networkStatus.isConnected || (await hasPendingOps()) || (await getPendingCount()) > 0) return;
      const { data: records, error: recErr } = await supabase
        .from("personal_records").select("*").eq("user_id", userId).eq("pr_type", "strength");
      if (recErr) { logError("rebuildStrengthRecords.read", recErr); return; }
      for (const exerciseId of wanted) {
        const { data: history, error } = await fetchExerciseHistory(exerciseId, userId);
        if (error || !Array.isArray(history)) { logError("rebuildStrengthRecords.history", error); return; }
        const rebuilt = strengthRecordFromHistory(history);
        const current = (records ?? []).find((r: any) => r.exercise_id === exerciseId);
        if (!current && rebuilt.max_weight == null && rebuilt.max_volume == null) continue;
        if (current && current.max_weight === rebuilt.max_weight && current.max_volume === rebuilt.max_volume) continue;
        const achieved_at = strengthRecordDateFromHistory(history);
        const values = { user_id: userId, exercise_id: exerciseId, pr_type: "strength" as const, ...rebuilt, ...(achieved_at ? { achieved_at } : {}) };
        const { error: upErr } = await supabase.from("personal_records")
          .upsert(values, { onConflict: "user_id,exercise_id,pr_type" });
        if (upErr) { logError("rebuildStrengthRecords.write", upErr); return; }
        await patchCachedList(`personalRecords:${userId}`, (rows) => {
          const i = rows.findIndex((r) => r.exercise_id === exerciseId && (r.pr_type ?? "strength") === "strength");
          if (i < 0) return [...rows, values];
          const next = [...rows];
          next[i] = { ...next[i], ...rebuilt, ...(achieved_at ? { achieved_at } : {}) };
          return next;
        });
      }
      done = true;
    });
    await deferRest();
  },

  // Custom Exercises
  getCustomExercises: async (userId: string) => {
    return cachedRead(
      shouldUseSupabase(),
      `customExercises:${userId}`,
      () => supabase.from("custom_exercises").select("*").eq("user_id", userId),
      () => localDb.getCustomExercises(userId),
    );
  },

  insertCustomExercise: async (exercise: {
    exercise_id: string;
    user_id: string;
    name: string;
    primary_muscle: string | null;
    equipment: string | null;
    exercise_type?: 'strength' | 'cardio' | 'stretching';
  }) => {
    const offline = offlineAccountWrite();
    if (offline) return offline;
    if (shouldUseSupabase()) {
      return supabase.from("custom_exercises").insert({ exercise_type: 'strength', ...exercise });
    }
    return localDb.insertCustomExercise(exercise);
  },

  deleteCustomExercise: async (exerciseId: string) => {
    const offline = offlineAccountWrite();
    if (offline) return offline;
    if (shouldUseSupabase()) {
      return supabase.from("custom_exercises").delete().eq("exercise_id", exerciseId);
    }
    return localDb.deleteCustomExercise(exerciseId);
  },

  // Batch queries (profile performance — collapse N requests into 1)
  getBatchSessionExercises: async (allSessionIds: number[]): Promise<{ data: any; error: any }> => {
    if (allSessionIds.length === 0) return { data: [], error: null };
    // Offline-logged workouts are read from the device, the rest as usual.
    const localIds = allSessionIds.filter((id) => isLocalId(id));
    const sessionIds = allSessionIds.filter((id) => !isLocalId(id));
    if (localIds.length > 0) {
      const local = (await Promise.all(localIds.map((id) => localDb.getSessionExercises(id)))).flatMap((r) => r.data ?? []);
      const remote = await db.getBatchSessionExercises(sessionIds);
      return { data: [...(remote.data ?? []), ...local], error: remote.error };
    }
    // Offline changes are waiting: read each workout's (patched) offline
    // copy instead of the batch cache or the not-yet-updated server.
    // (Small batches only: the profile's whole-history read would turn into
    // one request per workout. It catches up once the changes upload.)
    if (sessionIds.length <= 30 && (await hasPendingOps())) {
      const rs = await Promise.all(sessionIds.map((id) => db.getSessionExercises(id)));
      return { data: rs.flatMap((r: any) => r.data ?? []), error: null };
    }
    const batchRes = await cachedRead(
      shouldUseSupabase(),
      `batchSessionExercises:${[...sessionIds].sort((a, b) => a - b).join(",")}`,
      // Chunked and paged: Profile passes every workout ever logged, which
      // went past the 1000-row cap (and URL limits) after a few months.
      () => fetchInChunks(sessionIds, (chunk, from, to) => supabase.from("session_exercises")
        .select("*")
        .in("session_id", chunk)
        .order("exercise_order")
        .order("session_exercise_id")
        .range(from, to)),
      async () => {
        const results = await Promise.all(sessionIds.map(id => localDb.getSessionExercises(id)));
        return { data: results.flatMap(r => r.data ?? []), error: null };
      },
    );
    await mirrorPerParent(batchRes.data, sessionIds, "session_id", "sessionExercises");
    return batchRes;
  },

  getBatchSessionExerciseSets: async (allExerciseIds: number[]): Promise<{ data: any; error: any }> => {
    if (allExerciseIds.length === 0) return { data: [], error: null };
    const localIds = allExerciseIds.filter((id) => isLocalId(id));
    const exerciseIds = allExerciseIds.filter((id) => !isLocalId(id));
    if (localIds.length > 0) {
      const local = (await Promise.all(localIds.map((id) => localDb.getSessionExerciseSets(id)))).flatMap((r) => r.data ?? []);
      const remote = await db.getBatchSessionExerciseSets(exerciseIds);
      return { data: [...(remote.data ?? []), ...local], error: remote.error };
    }
    // Temporary IDs (exercises added offline) or offline changes waiting:
    // per exercise, which knows both.
    if (exerciseIds.some(isTempId) || (exerciseIds.length <= 30 && (await hasPendingOps()))) {
      const rs = await Promise.all(exerciseIds.map((id) => db.getSessionExerciseSets(id)));
      return { data: rs.flatMap((r: any) => r.data ?? []), error: null };
    }
    const batchRes = await cachedRead(
      shouldUseSupabase(),
      `batchSessionExerciseSets:${[...exerciseIds].sort((a, b) => a - b).join(",")}`,
      () => fetchInChunks(exerciseIds, (chunk, from, to) => supabase.from("session_exercise_sets")
        .select("*")
        .in("session_exercise_id", chunk)
        .order("set_number")
        .order("session_set_id")
        .range(from, to)),
      async () => {
        const results = await Promise.all(exerciseIds.map(id => localDb.getSessionExerciseSets(id)));
        return { data: results.flatMap(r => r.data ?? []), error: null };
      },
    );
    await mirrorPerParent(batchRes.data, exerciseIds, "session_exercise_id", "sessionExerciseSets");
    return batchRes;
  },

  // Exercise history for progression charts
  getExerciseHistory: async (exerciseId: string, userId: string) => {
    return cachedRead(
      shouldUseSupabase(),
      `exerciseHistory:${exerciseId}:${userId}`,
      () => fetchExerciseHistory(exerciseId, userId),
      () => localDb.getExerciseHistory(exerciseId, userId),
    );
  },

  // Sync offline-queued sessions to Supabase when reconnected
  syncPendingSessions: (userId: string): Promise<{ synced: number; errors: number }> => {
    if (syncInFlight) {
      syncAgain = true;
      return syncInFlight;
    }
    syncInFlight = (async () => {
      const total = { synced: 0, errors: 0 };
      do {
        syncAgain = false;
        const r = await runPendingSync(userId);
        total.synced += r.synced;
        total.errors += r.errors;
      } while (syncAgain);
      // Records edited offline can be rebuilt now the server has everything.
      await db.rebuildStrengthRecords(userId, []).catch((e: unknown) => logError("syncPendingSessions.rebuildRecords", e));
      return total;
    })().finally(() => { syncInFlight = null; });
    return syncInFlight;
  },

  // Workouts waiting to upload, plus queued changes to server workouts.
  /** Queued workouts and changes. With a userId, other accounts' queued workouts aren't counted. */
  getPendingSessionCount: async (userId?: string): Promise<number> => {
    const queued = userId
      ? (await getPendingQueue()).filter((p) => !p.session.user_id || p.session.user_id === userId).length
      : await getPendingCount();
    return queued + (await pendingOpCount());
  },

  /** Put back changes this account queued before it last signed out here. */
  restoreParkedChanges: (userId: string): Promise<number> => unparkOps(userId),

  // Cardio aggregate stats
  getCardioStats: async (userId: string) => {
    if (shouldUseSupabase()) {
      // Fetch all cardio session exercises for this user's completed sessions
      const { data: cardioExercises, error: cardioError } = await fetchAllPages((from, to) => supabase
        .from("session_exercises")
        .select("session_exercise_id, session_id, workout_sessions!inner(user_id, end_time)")
        .eq("exercise_type", "cardio")
        .eq("workout_sessions.user_id", userId)
        .not("workout_sessions.end_time", "is", null)
        .order("session_exercise_id")
        .range(from, to));
      if (cardioError) return { data: null, error: cardioError };

      if (!cardioExercises || cardioExercises.length === 0) {
        return { data: { totalDistanceMeters: 0, totalDurationSeconds: 0, totalCardioSessions: 0, longestRunMeters: 0, fastestPaceSecPerKm: null }, error: null };
      }

      // Chunked like getExerciseHistory: one huge .in() list hits URL limits
      // and PostgREST's 1000-row default cap on long histories.
      const sessionByExercise = new Map<number, number>();
      for (const e of cardioExercises as any[]) sessionByExercise.set(e.session_exercise_id, e.session_id);
      const exerciseIds = [...sessionByExercise.keys()];
      const setsRes = await fetchInChunks(exerciseIds, (chunk, from, to) =>
        supabase
          .from("session_exercise_sets")
          .select("session_set_id, session_exercise_id, distance_meters, duration_seconds, pace_sec_per_km")
          .in("session_exercise_id", chunk)
          // Same rule as history: rows from before the done flag are null.
          .or("completed.is.null,completed.eq.true")
          .order("session_set_id")
          .range(from, to)
      );
      if (setsRes.error) return { data: null, error: setsRes.error };
      const sets = setsRes.data ?? [];

      let totalDistanceMeters = 0;
      let totalDurationSeconds = 0;
      let longestRunMeters = 0;
      let fastestPaceSecPerKm: number | null = null;
      // Sessions where cardio was actually logged. This used to read
      // workout_sessions.session_id, which the query never selected, so
      // the count was always 1.
      const sessionIds = new Set<number>();

      for (const s of sets) {
        if (!s.duration_seconds && !s.distance_meters) continue;
        const sid = sessionByExercise.get(s.session_exercise_id);
        if (sid != null) sessionIds.add(sid);
        totalDistanceMeters += s.distance_meters ?? 0;
        totalDurationSeconds += s.duration_seconds ?? 0;
        if ((s.distance_meters ?? 0) > longestRunMeters) longestRunMeters = s.distance_meters;
        if (s.pace_sec_per_km && s.pace_sec_per_km > 0) {
          if (fastestPaceSecPerKm === null || s.pace_sec_per_km < fastestPaceSecPerKm) fastestPaceSecPerKm = s.pace_sec_per_km;
        }
      }

      return { data: { totalDistanceMeters, totalDurationSeconds, totalCardioSessions: sessionIds.size, longestRunMeters, fastestPaceSecPerKm }, error: null };
    }
    return localDb.getCardioStats(userId);
  },
};