// Changes to a workout that lives in Supabase, made with no signal, must be
// kept, shown, and uploaded in order when the signal returns.

const mockStore: Record<string, string> = {};
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn((k: string) => Promise.resolve(mockStore[k] ?? null)),
  setItem: jest.fn((k: string, v: string) => { mockStore[k] = v; return Promise.resolve(); }),
  removeItem: jest.fn((k: string) => { delete mockStore[k]; return Promise.resolve(); }),
  getAllKeys: jest.fn(() => Promise.resolve(Object.keys(mockStore))),
  multiRemove: jest.fn(() => Promise.resolve()),
  multiSet: jest.fn((entries: [string, string][]) => { for (const [k, v] of entries) mockStore[k] = v; return Promise.resolve(); }),
}));

// ─── A tiny in-memory Supabase ───────────────────────────────────────────────
type Row = Record<string, any>;
const PK: Record<string, string> = {
  workout_sessions: "session_id",
  session_exercises: "session_exercise_id",
  session_exercise_sets: "session_set_id",
};
const server: Record<string, Row[]> = { workout_sessions: [], session_exercises: [], session_exercise_sets: [], personal_records: [] };
let nextServerId = 500;
const mockNet = { isConnected: true, reachable: true };
const NETWORK_ERROR = { message: "Network request failed" };

function mockQuery(table: string) {
  let mode: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  let payload: any = null;
  const filters: ((r: Row) => boolean)[] = [];
  let single = false;
  const q: any = {
    select: () => q,
    insert: (v: any) => { mode = "insert"; payload = v; return q; },
    update: (v: any) => { mode = "update"; payload = v; return q; },
    upsert: (v: any) => { mode = "upsert"; payload = v; return q; },
    delete: () => { mode = "delete"; return q; },
    eq: (k: string, v: any) => { filters.push((r) => r[k] === v); return q; },
    in: (k: string, vs: any[]) => { filters.push((r) => vs.includes(r[k])); return q; },
    is: (k: string, v: any) => { filters.push((r) => (r[k] ?? null) === v); return q; },
    order: () => q,
    limit: () => q,
    range: () => q,
    or: () => q,
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
    if (mode === "upsert") {
      const i = rows.findIndex((r) => r.user_id === payload.user_id && r.exercise_id === payload.exercise_id && r.pr_type === payload.pr_type);
      if (i >= 0) rows[i] = { ...rows[i], ...payload };
      else rows.push({ ...payload });
      return { data: null, error: null };
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

jest.mock("../backend/supabaseClient", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } }, error: null }) }, from: (t: string) => mockQuery(t) } }));
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
  server.personal_records = [];
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

it("resumes a workout started after the app opened, then logged offline", async () => {
  await db.getActiveSession("u1"); // app start
  server.workout_sessions[0].end_time = "16:00:00"; // no active one yet…
  await db.getActiveSession("u1");
  const { data: started } = await db.startWorkoutSession({ routine_id: null, session_name: "Legs", user_id: "u1" });
  goOffline();
  expect((await db.getActiveSession("u1")).data?.session_id).toBe(started.session_id);
});

it("doesn't offer to resume a workout finished offline once back online", async () => {
  await db.getWorkoutSession(1);
  goOffline();
  await db.finishWorkoutSession(1, null);
  mockNet.isConnected = true; // signal back, upload not done yet
  expect((await db.getActiveSession("u1")).data).toBeNull();
});

it("shows offline edits on the edit screen's batch read", async () => {
  await db.getBatchSessionExercises([1]);
  await db.getBatchSessionExerciseSets([10]);
  goOffline();
  await db.updateSessionExerciseSet(100, { reps: 12 });
  const { data: newEx } = await db.insertSessionExercise({ session_id: 1, exercise_id: "dip", exercise_name: "Dip", exercise_order: 2, notes: null });
  await db.insertSessionExerciseSet({ session_exercise_id: newEx.session_exercise_id, set_number: 1, weight: null, reps: 10, is_warmup: false });

  const exs = (await db.getBatchSessionExercises([1])).data;
  expect(exs.map((e: any) => e.exercise_id)).toEqual(["bench", "dip"]);
  const sets = (await db.getBatchSessionExerciseSets(exs.map((e: any) => e.session_exercise_id))).data;
  expect(sets.map((s: any) => s.reps)).toEqual([12, 10]);
});

it("retries server trouble a few times before giving up on a change", async () => {
  await outbox.enqueueOp({ kind: "update", table: "session_exercise_sets", id: 1, values: {} });
  const dropped: any[] = [];
  const exec = async () => ({ ok: false, retry: false, transient: true });
  for (let i = 0; i < 4; i++) {
    expect((await outbox.flushOutbox(exec, (op: any) => dropped.push(op))).remaining).toBe(1);
  }
  expect((await outbox.flushOutbox(exec, (op: any) => dropped.push(op))).remaining).toBe(0);
  expect(dropped).toHaveLength(1);
});

it("keeps a PR set offline and uploads it with the rest", async () => {
  await db.getPersonalRecords("u1");
  goOffline();
  await db.upsertPersonalRecord({ user_id: "u1", exercise_id: "bench", max_weight: 225, max_volume: 1125 });
  const prs = (await db.getPersonalRecords("u1")).data;
  expect(prs).toEqual([expect.objectContaining({ exercise_id: "bench", max_weight: 225 })]);
  expect(server.personal_records).toHaveLength(0);
  goOnline();
  await db.syncPendingSessions("u1");
  expect(server.personal_records).toEqual([expect.objectContaining({ exercise_id: "bench", max_weight: 225, pr_type: "strength" })]);
});

it("never lowers a better PR already on the server", async () => {
  server.personal_records = [{ user_id: "u1", exercise_id: "bench", pr_type: "strength", max_weight: 300, max_volume: 900 }];
  goOffline();
  await db.upsertPersonalRecord({ user_id: "u1", exercise_id: "bench", max_weight: 225, max_volume: 1125 });
  goOnline();
  await db.syncPendingSessions("u1");
  expect(server.personal_records[0]).toMatchObject({ max_weight: 300, max_volume: 1125 });
});

describe("changes queued before a sign-out", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { supabase } = require("../backend/supabaseClient");
  let signedIn: string | null = "u1";
  beforeEach(() => {
    signedIn = "u1";
    supabase.auth.getSession = async () => ({ data: { session: signedIn ? { user: { id: signedIn } } : null }, error: null });
    supabase.auth.signOut = async () => { signedIn = null; return { error: null }; };
  });

  it("wait for their account instead of replaying under the next one", async () => {
    await db.getSessionExerciseSets(10);
    goOffline();
    await db.updateSessionExerciseSet(100, { reps: 9 });
    await db.signOut();
    expect(await db.getPendingSessionCount()).toBe(0); // set aside, not dropped

    goOnline();
    signedIn = "u2";
    await db.syncPendingSessions("u2");
    expect(server.session_exercise_sets[0].reps).toBe(5); // u2 didn't replay it

    signedIn = "u1";
    await db.syncPendingSessions("u1");
    expect(server.session_exercise_sets[0].reps).toBe(9);
    expect(await db.getPendingSessionCount()).toBe(0);
  });

  it("doesn't park a change that's uploading, so it isn't sent twice", async () => {
    await outbox.enqueueOp({ kind: "update", table: "session_exercise_sets", id: 1, values: {} });
    await outbox.enqueueOp({ kind: "update", table: "session_exercise_sets", id: 2, values: {} });
    let release: () => void = () => {};
    const sent: number[] = [];
    const flush = outbox.flushOutbox(async (op: any) => {
      sent.push(op.id);
      if (op.id === 1) await new Promise<void>((r) => { release = r; });
      return { ok: true };
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(await outbox.parkOps("u1")).toBe(1); // only op 2
    release();
    await flush;
    await outbox.unparkOps("u1");
    await outbox.flushOutbox(async (op: any) => { sent.push(op.id); return { ok: true }; });
    expect(sent).toEqual([1, 2]);
  });

  it("puts parked changes ahead of newer ones, once", async () => {
    await outbox.enqueueOp({ kind: "update", table: "session_exercise_sets", id: 1, values: { reps: 1 } });
    expect(await outbox.parkOps("u1")).toBe(1);
    await outbox.enqueueOp({ kind: "update", table: "session_exercise_sets", id: 2, values: { reps: 2 } });
    expect(await outbox.unparkOps("u1")).toBe(1);
    expect(await outbox.unparkOps("u1")).toBe(0);
    const seen: number[] = [];
    await outbox.flushOutbox(async (op: any) => { seen.push(op.id); return { ok: true }; });
    expect(seen).toEqual([1, 2]);
  });
});

describe("workouts logged offline and uploaded later", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const queue = require("../backend/offlineQueue");
  const pending = (user: string, localId: number) => ({
    local_session_id: localId,
    session: { routine_id: null, session_name: "Legs", session_date: "2026-11-09", start_time: "18:30:00", end_time: "19:30:00", notes: null, user_id: user },
    exercises: [],
    sets: [],
  });

  it("are dated when they happened and only go to their own account", async () => {
    await queue.enqueuePendingSession(pending("u1", 1e12 + 1));
    await queue.enqueuePendingSession(pending("u2", 1e12 + 2));
    await db.syncPendingSessions("u1");
    const uploaded = server.workout_sessions.filter((s) => s.session_name === "Legs");
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0].user_id).toBe("u1");
    expect(uploaded[0].created_at).toBe(new Date("2026-11-09T18:30:00").toISOString());
    // u2's workout is still waiting for u2.
    expect((await queue.getPendingQueue()).map((p: any) => p.session.user_id)).toEqual(["u2"]);
  });

  it("aren't uploaded twice if the app closed before the queue was trimmed", async () => {
    await queue.enqueuePendingSession(pending("u1", 1e12 + 3));
    await queue.markLocalSessionsSynced({ [1e12 + 3]: 777 });
    await db.syncPendingSessions("u1");
    expect(server.workout_sessions.filter((s) => s.session_name === "Legs")).toHaveLength(0);
    expect(await queue.getPendingQueue()).toEqual([]);
  });
});

it("queues a photo removal made offline instead of pretending it worked", async () => {
  server.workout_sessions[0].photo_url = "u1/1.jpg";
  server.workout_sessions[0].end_time = "18:00:00";
  await db.getWorkoutSession(1);
  goOffline();
  const res = await db.updateSessionPhotoUrl(1, null);
  expect(res.error).toBeNull();
  expect((await db.getWorkoutSession(1)).data.photo_url).toBeNull();
  goOnline();
  await db.syncPendingSessions("u1");
  expect(server.workout_sessions[0].photo_url).toBeNull();
});
