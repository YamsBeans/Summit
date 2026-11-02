import AsyncStorage from "@react-native-async-storage/async-storage";

// Outbox for changes to workouts that live in Supabase, made while the server
// can't be reached: a workout started at home that goes on in a basement gym,
// or an old workout edited on the train. Each change is saved here in order
// and replayed when the signal is back. Rows created offline get a temporary
// negative ID; replay swaps it for the real one, here and in later changes.
//
// (Workouts *started* offline are different: they live in localDb with local
// IDs and are uploaded whole by the sync queue in offlineQueue.ts.)

export type OutboxTable = "workout_sessions" | "session_exercises" | "session_exercise_sets" | "personal_records";

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
        const result: ExecuteResult = ready ? await execute(ready) : { ok: false, retry: false };
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
          ops.shift();
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

/** Test helper. */
export function __resetOutboxForTests() {
  ops = [];
  idMap = {};
  loaded = null;
  lock = Promise.resolve();
  flushing = null;
  flushAgain = false;
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
