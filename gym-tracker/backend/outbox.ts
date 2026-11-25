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
  /** Server-side failures so far (a 5xx, an expired login). */
  attempts?: number;
  /** When the first of those failures happened (ms since epoch). */
  firstFailedAt?: number;
};

// A change that keeps failing on the server's side is given up on only after
// MAX_ATTEMPTS failures spread over at least GIVE_UP_AFTER_MS. Counting tries
// alone dropped queued sets after a ~8 minute outage, since the sync retries
// on a 30 s → 5 min backoff and every logged set also starts a flush. The
// window is kept short because a change that will never go through (a bad
// row) holds up everything queued behind it until it's given up.
const MAX_ATTEMPTS = 5;
const GIVE_UP_AFTER_MS = 60 * 60_000;

/** True when a server-side failure (this one included) should end the change. */
export function shouldGiveUp(op: Pick<OutboxOp, "attempts" | "firstFailedAt">, now = Date.now()): boolean {
  const attempts = (op.attempts ?? 0) + 1;
  const since = op.firstFailedAt ?? now;
  return attempts >= MAX_ATTEMPTS && now - since >= GIVE_UP_AFTER_MS;
}

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
// Whoever signed out while `inFlight` was uploading. If the upload doesn't
// go through, it's theirs to retry, not the next account's.
let inFlightOwner: string | null = null;
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
        inFlightOwner = null;
        let result: ExecuteResult;
        try {
          result = ready ? await execute(ready) : { ok: false, retry: false };
        } catch (e) {
          inFlight = null;
          inFlightOwner = null;
          throw e;
        }
        const transient = !result.ok && !result.retry && result.transient === true;
        const keep = !result.ok && (result.retry || (transient && !shouldGiveUp(op)));
        if (!result.ok && !keep) onDrop?.(op, result.error);
        // `inFlight` stays set until here, inside the lock, so a sign-out
        // can't park this op in the gap and upload it a second time.
        await withLock(async () => {
          const owner = inFlightOwner;
          inFlight = null;
          inFlightOwner = null;
          // By identity: a sign-in during the upload may have put parked
          // changes in front of it, and a sign-out may have parked the rest.
          const at = ops.indexOf(op);
          if (keep) {
            if (transient) {
              op.attempts = (op.attempts ?? 0) + 1;
              op.firstFailedAt = op.firstFailedAt ?? Date.now();
            }
            // Its account signed out mid-upload: set it aside with the rest
            // of that account's changes instead of replaying it for whoever
            // is signed in now.
            if (owner != null && at >= 0 && (await moveToParkedFront(owner, op))) return;
            await persist();
            return;
          }
          if (at >= 0) ops.splice(at, 1);
          if (result.ok) {
            done++;
            if (op.tempId != null && result.id != null) idMap[String(op.tempId)] = result.id;
          } else {
            dropped++;
          }
          await persist();
        });
        if (keep) break;
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

/**
 * Move one queued change to the front of `owner`'s parked list. Call inside
 * the lock. Both lists are written in one multiSet, so a crash can't leave
 * the change in both (uploaded twice) or in neither (lost).
 */
async function moveToParkedFront(owner: string, op: OutboxOp): Promise<boolean> {
  const key = PARKED_PREFIX + owner;
  try {
    const raw = await AsyncStorage.getItem(key);
    const parked: OutboxOp[] = raw ? JSON.parse(raw) : [];
    const rest = ops.filter((o) => o !== op);
    await AsyncStorage.multiSet([
      [key, JSON.stringify([op, ...parked])],
      [OPS_KEY, JSON.stringify(rest)],
    ]);
    ops = rest;
    return true;
  } catch {
    return false;
  }
}

/** Set aside every queued change for `owner` (on sign-out). Returns how many. */
export function parkOps(owner: string): Promise<number> {
  return withLock(async () => {
    await ensureLoaded();
    if (inFlight && inFlightOwner == null && ops.includes(inFlight)) inFlightOwner = owner;
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
    // This account is signed in again, so a change of its own still
    // uploading is its own again, even when nothing else was parked.
    // Otherwise a failed upload was parked while the account was signed in,
    // and later changes that depended on it were dropped.
    const ownInFlight = inFlight != null && inFlightOwner === owner && ops.includes(inFlight);
    if (inFlightOwner === owner) inFlightOwner = null;
    const key = PARKED_PREFIX + owner;
    let parked: OutboxOp[] = [];
    try {
      const raw = await AsyncStorage.getItem(key);
      parked = raw ? JSON.parse(raw) : [];
    } catch {
      return 0;
    }
    if (parked.length === 0) return 0;
    const before = ops;
    // Its change still uploading came before everything it parked, so it
    // stays first.
    ops = ownInFlight
      ? [inFlight!, ...parked, ...ops.filter((o) => o !== inFlight)]
      : [...parked, ...ops];
    // Drop the parked copy first, so a failure can't put them back twice.
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      ops = before;
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
  inFlightOwner = null;
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
