// Changes to a workout that lives in Supabase, made with no signal, must be
// kept, shown, and uploaded in order when the signal returns.

const mockStore: Record<string, string> = {};
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn((k: string) => Promise.resolve(mockStore[k] ?? null)),
  setItem: jest.fn((k: string, v: string) => { mockStore[k] = v; return Promise.resolve(); }),
  removeItem: jest.fn((k: string) => { delete mockStore[k]; return Promise.resolve(); }),
  getAllKeys: jest.fn(() => Promise.resolve(Object.keys(mockStore))),
  multiRemove: jest.fn(() => Promise.resolve()),
}));

// ─── A tiny in-memory Supabase ───────────────────────────────────────────────
type Row = Record<string, any>;
const PK: Record<string, string> = {
  workout_sessions: "session_id",
  session_exercises: "session_exercise_id",
  session_exercise_sets: "session_set_id",
};
const server: Record<string, Row[]> = { workout_sessions: [], session_exercises: [], session_exercise_sets: [] };
let nextServerId = 500;
const mockNet = { isConnected: true, reachable: true };
const NETWORK_ERROR = { message: "Network request failed" };

function mockQuery(table: string) {
  let mode: "select" | "insert" | "update" | "delete" = "select";
  let payload: any = null;
  const filters: ((r: Row) => boolean)[] = [];
  let single = false;
  const q: any = {
    select: () => q,
    insert: (v: any) => { mode = "insert"; payload = v; return q; },
    update: (v: any) => { mode = "update"; payload = v; return q; },
    delete: () => { mode = "delete"; return q; },
    eq: (k: string, v: any) => { filters.push((r) => r[k] === v); return q; },
    in: (k: string, vs: any[]) => { filters.push((r) => vs.includes(r[k])); return q; },
    is: (k: string, v: any) => { filters.push((r) => (r[k] ?? null) === v); return q; },
    order: () => q,
    limit: () => q,
    single: () => { single = true; return q; },
    maybeSingle: () => { single = true; return q; },
    then: (resolve: any) => resolve(run()),
  };
  function run() {
    if (!mockNet.reachable) return { data: null, error: NETWORK_ERROR };
    const rows = server[table];
    const match = (r: Row) => filters.every((f) => f(r));
    if (mode === "insert") {
      const items = (Array.isArray(payload) ? payload : [payload]).map((v: Row) => ({ ...v, [PK[table]]: nextServerId++ }));
      rows.push(...items);
      return { data: single ? items[0] : items, error: null };
    }
    if (mode === "update") {
      rows.filter(match).forEach((r) => Object.assign(r, payload));
      return { data: null, error: null };
    }
    if (mode === "delete") {
      server[table] = rows.filter((r) => !match(r));
      return { data: null, error: null };
    }
    const found = rows.filter(match).map((r) => ({ ...r }));
    return { data: single ? found[0] ?? null : found, error: null };
  }
  return q;
}

jest.mock("../backend/supabaseClient", () => ({ supabase: { auth: {}, from: (t: string) => mockQuery(t) } }));
jest.mock("../backend/networkStatus", () => ({ networkStatus: mockNet }));
jest.mock("../backend/localDb", () => ({
  localDb: {
    getActiveSession: async () => ({ data: null, error: null }),
    insertSessionExerciseSet: async () => { throw new Error("should not use the device store"); },
    updateSessionExerciseSet: async () => { throw new Error("should not use the device store"); },
  },
  isLocalId: (id: any) => typeof id === "number" && id >= 1e12,
  loadLocalDb: async () => {},
  finishedLocalSessionIds: async () => [],
  removeLocalSessions: async () => {},
}));
jest.mock("expo-linking", () => ({ createURL: (p: string) => p }));

process.env.EXPO_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "anon";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require("../backend/db");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const outbox = require("../backend/outbox");

const goOffline = () => { mockNet.isConnected = false; mockNet.reachable = false; };
const goOnline = () => { mockNet.isConnected = true; mockNet.reachable = true; };

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  outbox.__resetOutboxForTests();
  server.workout_sessions = [{ session_id: 1, user_id: "u1", session_name: "Push", end_time: null, session_date: "2026-11-02", start_time: "17:00:00" }];
  server.session_exercises = [{ session_exercise_id: 10, session_id: 1, exercise_id: "bench", exercise_name: "Bench", exercise_order: 1 }];
  server.session_exercise_sets = [{ session_set_id: 100, session_exercise_id: 10, set_number: 1, weight: 135, reps: 5, completed: false }];
  nextServerId = 500;
  goOnline();
});

it("keeps logging a server workout with no signal and uploads it in order", async () => {
  // Opened online: the screen's reads fill the cache.
  await db.getWorkoutSession(1);
  await db.getSessionExercises(1);
  await db.getSessionExerciseSets(10);

  goOffline();
  await db.updateSessionExerciseSet(100, { completed: true });
  const { data: newSet } = await db.insertSessionExerciseSet({ session_exercise_id: 10, set_number: 2, weight: 135, reps: 5, is_warmup: false });
  expect(newSet.session_set_id).toBeLessThan(0); // temporary
  const { data: newEx } = await db.insertSessionExercise({ session_id: 1, exercise_id: "ohp", exercise_name: "OHP", exercise_order: 2, notes: null });
  await db.insertSessionExerciseSet({ session_exercise_id: newEx.session_exercise_id, set_number: 1, weight: 95, reps: 8, is_warmup: false });
  await db.finishWorkoutSession(1, "felt good");

  // The screen sees everything that was logged...
  const sets = (await db.getSessionExerciseSets(10)).data;
  expect(sets.map((s: any) => [s.set_number, s.completed])).toEqual([[1, true], [2, false]]);
  expect((await db.getSessionExercises(1)).data.map((e: any) => e.exercise_id)).toEqual(["bench", "ohp"]);
  expect((await db.getSessionExerciseSets(newEx.session_exercise_id)).data[0]).toMatchObject({ weight: 95, reps: 8 });
  expect((await db.getWorkoutSession(1)).data.notes).toBe("felt good");
  // ...and the server hasn't been touched.
  expect(server.session_exercise_sets).toHaveLength(1);

  goOnline();
  await db.syncPendingSessions("u1");

  expect(server.session_exercise_sets.find((s) => s.session_set_id === 100)!.completed).toBe(true);
  const ohp = server.session_exercises.find((e) => e.exercise_id === "ohp")!;
  expect(ohp.session_exercise_id).toBeGreaterThan(0);
  const ohpSets = server.session_exercise_sets.filter((s) => s.session_exercise_id === ohp.session_exercise_id);
  expect(ohpSets).toHaveLength(1);
  expect(server.session_exercise_sets.filter((s) => s.session_exercise_id === 10)).toHaveLength(2);
  expect(server.workout_sessions[0]).toMatchObject({ notes: "felt good" });
  expect(server.workout_sessions[0].end_time).not.toBeNull();
  expect(await db.getPendingSessionCount()).toBe(0);

  // The screen still holds the temporary ID; later edits reach the real row.
  await db.updateSessionExerciseSet(newSet.session_set_id, { reps: 6 });
  const uploaded = server.session_exercise_sets.find((s) => s.session_exercise_id === 10 && s.set_number === 2)!;
  expect(uploaded.reps).toBe(6);
});

it("queues behind waiting changes even when the signal is back, so order holds", async () => {
  await db.getSessionExerciseSets(10);
  goOffline();
  await db.updateSessionExerciseSet(100, { reps: 3 });
  mockNet.isConnected = true; // NetInfo says yes; the server still can't be reached
  await db.updateSessionExerciseSet(100, { reps: 4 });
  expect(server.session_exercise_sets[0].reps).toBe(5);

  goOnline();
  await db.syncPendingSessions("u1");
  expect(server.session_exercise_sets[0].reps).toBe(4);
});

it("falls back to the outbox when a request fails with no signal (lie-fi)", async () => {
  mockNet.reachable = false; // connected per NetInfo, but requests fail
  const res = await db.updateSessionExerciseSet(100, { completed: true });
  expect(res.error).toBeNull();
  expect(await db.getPendingSessionCount()).toBe(1);
  mockNet.reachable = true;
  await db.syncPendingSessions("u1");
  expect(server.session_exercise_sets[0].completed).toBe(true);
});

it("resumes a server workout from the cache after reopening offline", async () => {
  await db.getActiveSession("u1");
  goOffline();
  expect((await db.getActiveSession("u1")).data?.session_id).toBe(1);
  await db.finishWorkoutSession(1, null);
  expect((await db.getActiveSession("u1")).data).toBeNull();
});

describe("translateOp", () => {
  it("swaps temporary IDs, and waits when one isn't known", () => {
    const op = { kind: "insert", table: "session_exercise_sets", values: { session_exercise_id: -5, weight: 1 } };
    expect(outbox.translateOp(op, { "-5": 42 }).values.session_exercise_id).toBe(42);
    expect(outbox.translateOp(op, {})).toBeNull();
    expect(outbox.translateOp({ kind: "update", table: "session_exercise_sets", id: 7, values: {} }, {}).id).toBe(7);
  });
});

it("drops a change the server refuses instead of blocking the rest", async () => {
  await outbox.enqueueOp({ kind: "update", table: "session_exercise_sets", id: 1, values: {} });
  await outbox.enqueueOp({ kind: "update", table: "session_exercise_sets", id: 2, values: {} });
  const seen: number[] = [];
  const res = await outbox.flushOutbox(async (op: any) => {
    seen.push(op.id);
    return op.id === 1 ? { ok: false, retry: false } : { ok: true };
  });
  expect(seen).toEqual([1, 2]);
  expect(res).toEqual({ done: 1, dropped: 1, remaining: 0 });
});
