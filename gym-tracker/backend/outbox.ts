import AsyncStorage from "@react-native-async-storage/async-storage";

// Outbox for changes to workouts that live in Supabase, made while the server
// can't be reached: a workout started at home that goes on in a basement gym,
// or an old workout edited on the train. Each change is saved here in order
// and replayed when the signal is back. Rows created offline get a temporary
// negative ID; replay swaps it for the real one, here and in later changes.
//
// (Workouts *started* offline are different: they live in localDb with local
// IDs and are uploaded whole by the sync queue in offlineQueue.ts.)

// routine_exercise_sets: only updates, for routine targets refreshed by a
// workout finished offline (see syncSessionSetsToRoutine).
export type OutboxTable = "workout_sessions" | "session_exercises" | "session_exercise_sets" | "personal_records" | "routine_exercise_sets";

export type OutboxOp = {
  kind: "insert" | "update" | "delete" | "upsert";
  table: OutboxTable;
  /** Primary key for update/delete (may be a temporary ID). */
  id?: number;
  /** Temporary ID handed out for an insert. */
  tempId?: number;
  values?: Record<string, any>;
  /** For upserts: the unique columns to match on. */
  onConflict?: string;
  /** Server-side failures so far (a 5xx, an expired login); dropped after MAX_ATTEMPTS. */
  attempts?: number;
};

const MAX_ATTEMPTS = 5;

export const PRIMARY_KEY: Record<OutboxTable, string> = {
  workout_sessions: "session_id",
  session_exercises: "session_exercise_id",
  session_exercise_sets: "session_set_id",
  personal_records: "pr_id",
  routine_exercise_sets: "routine_set_id",
};

// Foreign keys inside `values` that may point at a row created offline.
const FOREIGN_KEYS = ["session_id", "session_exercise_id"];

const OPS_KEY = "@gym_tracker_outbox";
const MAP_KEY = "@gym_tracker_outbox_ids";

let ops: OutboxOp[] = [];
let idMap: Record<string, number> = {};
let loaded: Promise<void> | null = null;
let lock: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn);
  lock = run.catch(() => {});
  return run;
}

function ensureLoaded(): Promise<void> {
  if (!loaded) {
    loaded = (async () => {
      try {
        const [rawOps, rawMap] = await Promise.all([AsyncStorage.getItem(OPS_KEY), AsyncStorage.getItem(MAP_KEY)]);
        ops = rawOps ? JSON.parse(rawOps) : [];
        idMap = rawMap ? JSON.parse(rawMap) : {};
      } catch {
        ops = [];
        idMap = {};
      }
    })();
  }
  return loaded;
}

async function persist() {
  try {
    if (ops.length === 0) await AsyncStorage.removeItem(OPS_KEY);
    else await AsyncStorage.setItem(OPS_KEY, JSON.stringify(ops));
    await AsyncStorage.setItem(MAP_KEY, JSON.stringify(idMap));
  } catch {
    // Best-effort; the in-memory copy still replays this session.
  }
}

export const isTempId = (id: unknown): id is number => typeof id === "number" && id < 0;

let lastTemp = 0;
/** A unique negative ID for a row created offline. */
export function newTempId(): number {
  const t = -(Date.now() * 1000);
  lastTemp = Math.min(t, lastTemp - 1);
  return lastTemp;
}

/** Real ID for a temporary one, once it has been uploaded (else null). Real IDs pass through. */
export async function resolveId(id: number): Promise<number | null> {
  if (!isTempId(id)) return id;
  await ensureLoaded();
  return idMap[String(id)] ?? null;
}

export async function hasPendingOps(): Promise<boolean> {
  await ensureLoaded();
  return ops.length > 0;
}

/**
 * Save a change for later. `afterSave` runs inside the same lock, so updates
 * to the offline view (the read cache) happen in the same order as the
 * changes themselves even when several are made at once.
 */
export function enqueueOp(op: OutboxOp, afterSave?: () => Promise<void>): Promise<void> {
  return withLock(() => enqueueOpHoldingLock(op, afterSave));
}

/** enqueueOp for code already running inside inOutboxOrder (taking the lock again would deadlock). */
export async function enqueueOpHoldingLock(op: OutboxOp, afterSave?: () => Promise<void>): Promise<void> {
  await ensureLoaded();
  ops.push(op);
  await persist();
  if (afterSave) {
    try {
      await afterSave();
    } catch {
      // The change is saved; only the offline preview failed.
    }
  }
}

/** True if a queued change matches (e.g. "this workout was finished offline"). */
export async function hasPendingOp(match: (op: OutboxOp) => boolean): Promise<boolean> {
  await ensureLoaded();
  return ops.some(match);
}

/** Run something in order with queued changes (e.g. a read-modify-write of the cache). */
export function inOutboxOrder<T>(fn: () => Promise<T>): Promise<T> {
  return withLock(fn);
}

export type ExecuteResult =
  | { ok: true; id?: number }
  // retry: couldn't reach the server, stop and try again later.
  // transient: the server had a problem (5xx, expired login); try again
  //   later, but give up after a few attempts so it can't block forever.
  // Otherwise the server refused it; drop it so it can't block the rest.
  | { ok: false; retry: boolean; transient?: boolean; error?: unknown };

/** The op with temporary IDs swapped for real ones, or null if one isn't known yet. */
export function translateOp(op: OutboxOp, map: Record<string, number>): OutboxOp | null {
  const lookup = (id: number) => (isTempId(id) ? map[String(id)] ?? null : id);
  const out: OutboxOp = { ...op, values: op.values ? { ...op.values } : undefined };
  if (op.id != null) {
    const id = lookup(op.id);
    if (id == null) return null;
    out.id = id;
  }
  for (const fk of FOREIGN_KEYS) {
    const v = out.values?.[fk];
    if (typeof v === "number") {
      const id = lookup(v);
      if (id == null) return null;
      out.values![fk] = id;
    }
  }
  return out;
}

let flushing: Promise<{ done: number; dropped: number; remaining: number }> | null = null;
// The change being uploaded right now (outside the lock). parkOps leaves it
// in the queue, or it would be parked and uploaded a second time later.
let inFlight: OutboxOp | null = null;
let flushAgain = false;

/**
 * Replay queued changes in order. Stops at the first one that can't reach
 * the server. One flush at a time; a call during a flush shares it, and
 * gets one more pass afterwards (the signal may have come back since that
 * flush gave up).
 */
export function flushOutbox(
  execute: (op: OutboxOp) => Promise<ExecuteResult>,
  onDrop?: (op: OutboxOp, error: unknown) => void,
): Promise<{ done: number; dropped: number; remaining: number }> {
  if (flushing) {
    flushAgain = true;
    return flushing;
  }
  flushing = (async () => {
    await ensureLoaded();
    let done = 0;
    let dropped = 0;
    do {
      flushAgain = false;
      while (ops.length > 0) {
        const op = ops[0];
        const ready = translateOp(op, idMap);
        // A change to a row whose creation was refused can never apply.
        inFlight = op;
        let result: ExecuteResult;
        try {
          result = ready ? await execute(ready) : { ok: false, retry: false };
        } finally {
          inFlight = null;
        }
        if (!result.ok && result.retry) break;
        if (!result.ok && result.transient && (op.attempts ?? 0) + 1 < MAX_ATTEMPTS) {
          await withLock(async () => {
            op.attempts = (op.attempts ?? 0) + 1;
            await persist();
          });
          break;
        }
        if (!result.ok) onDrop?.(op, result.error);
        await withLock(async () => {
          // Sign-out may have parked the queue while this op was in flight.
          if (ops[0] === op) ops.shift();
          if (result.ok) {
            done++;
            if (op.tempId != null && result.id != null) idMap[String(op.tempId)] = result.id;
          } else {
            dropped++;
          }
          await persist();
        });
      }
    } while (flushAgain);
    return { done, dropped, remaining: ops.length };
  })().finally(() => { flushing = null; });
  return flushing;
}

// ─── Changes waiting for a signed-out account ────────────────────────────────
// Queued changes belong to whoever was signed in when they were made. On
// sign-out they're set aside under that account and put back when it signs
// in again. Before, the next account on the device replayed them: its login
// was refused by row-level security and the first account's sets were lost.

const PARKED_PREFIX = "@gym_tracker_outbox_parked:";

/** Set aside every queued change for `owner` (on sign-out). Returns how many. */
export function parkOps(owner: string): Promise<number> {
  return withLock(async () => {
    await ensureLoaded();
    const toPark = ops.filter((o) => o !== inFlight);
    if (toPark.length === 0) return 0;
    const key = PARKED_PREFIX + owner;
    let parked: OutboxOp[] = [];
    try {
      const raw = await AsyncStorage.getItem(key);
      parked = raw ? JSON.parse(raw) : [];
    } catch {
      parked = [];
    }
    try {
      await AsyncStorage.setItem(key, JSON.stringify([...parked, ...toPark]));
    } catch {
      // Couldn't set them aside; keep them queued rather than lose them.
      return 0;
    }
    ops = ops.filter((o) => o === inFlight);
    await persist();
    return toPark.length;
  });
}

/** Put `owner`'s parked changes back at the front of the queue (on sign-in). */
export function unparkOps(owner: string): Promise<number> {
  return withLock(async () => {
    await ensureLoaded();
    const key = PARKED_PREFIX + owner;
    let parked: OutboxOp[] = [];
    try {
      const raw = await AsyncStorage.getItem(key);
      parked = raw ? JSON.parse(raw) : [];
    } catch {
      return 0;
    }
    if (parked.length === 0) return 0;
    ops = [...parked, ...ops];
    // Drop the parked copy first, so a failure can't put them back twice.
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      ops = ops.slice(parked.length);
      return 0;
    }
    await persist();
    return parked.length;
  });
}

/** Test helper. */
export function __resetOutboxForTests() {
  ops = [];
  idMap = {};
  loaded = null;
  lock = Promise.resolve();
  flushing = null;
  flushAgain = false;
  inFlight = null;
  lastTemp = 0;
}

export async function pendingOpCount(): Promise<number> {
  await ensureLoaded();
  return ops.length;
}

/** The op with every temporary ID swapped for its real one, or null if one isn't uploaded yet. */
export async function translateWithKnownIds(op: OutboxOp): Promise<OutboxOp | null> {
  await ensureLoaded();
  return translateOp(op, idMap);
}
