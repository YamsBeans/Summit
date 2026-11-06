// A workout started with no signal must keep logging to the on-device store
// after the signal returns, and be queued (not lost) when finished online.

const mockNet = { isConnected: true };
const mockStore: Record<string, string> = {};
const LOCAL = 1_000_000_000_001;
let mockFinished: number[] = [];

const mockLocal = {
  getActiveSession: jest.fn(async () => ({ data: null as any, error: null })),
  getWorkoutSession: jest.fn(async (id: number) => ({
    data: { session_id: id, routine_id: null, session_name: "Gym", session_date: "2026-11-02", start_time: "18:00:00", end_time: "19:00:00", notes: null, user_id: "u1" },
    error: null,
  })),
  getSessionExercises: jest.fn(async () => ({ data: [{ session_exercise_id: LOCAL + 1, exercise_id: "bench", exercise_name: "Bench", exercise_order: 1, notes: null, exercise_type: "strength" }], error: null })),
  getSessionExerciseSets: jest.fn(async () => ({ data: [{ session_exercise_id: LOCAL + 1, set_number: 1, weight: 135, reps: 5, is_warmup: false, completed: true }], error: null })),
  insertSessionExerciseSet: jest.fn(async (s: any) => ({ data: { session_set_id: LOCAL + 9, ...s }, error: null })),
  updateSessionExerciseSet: jest.fn(async () => ({ error: null })),
  finishWorkoutSession: jest.fn(async () => ({ error: null })),
  updateSessionPhotoUrl: jest.fn(async () => ({ error: null })) as any,
};

// Minimal chainable Supabase stub that records which tables were touched.
const touched: string[] = [];
const chain: any = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === "then") return (res: any) => res({ data: null, error: null });
    return () => chain;
  },
});
const mockSupabase = {
  auth: {},
  from: jest.fn((table: string) => { touched.push(table); return chain; }),
};

jest.mock("../backend/supabaseClient", () => ({ supabase: mockSupabase }));
jest.mock("../backend/networkStatus", () => ({ networkStatus: mockNet }));
jest.mock("../backend/localDb", () => ({
  localDb: mockLocal,
  isLocalId: (id: any) => typeof id === "number" && id >= 1e12,
  loadLocalDb: async () => {},
  finishedLocalSessionIds: jest.fn(async () => mockFinished),
  removeLocalSessions: jest.fn(async () => {}),
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn((k: string) => Promise.resolve(mockStore[k] ?? null)),
  setItem: jest.fn((k: string, v: string) => { mockStore[k] = v; return Promise.resolve(); }),
  removeItem: jest.fn((k: string) => { delete mockStore[k]; return Promise.resolve(); }),
  getAllKeys: jest.fn(() => Promise.resolve(Object.keys(mockStore))),
  multiRemove: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-linking", () => ({ createURL: (p: string) => p }));

process.env.EXPO_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "anon";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require("../backend/db");

beforeEach(() => {
  jest.clearAllMocks();
  touched.length = 0;
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  mockNet.isConnected = true;
  mockFinished = [];
});

it("logs sets of an offline-started workout locally even when back online", async () => {
  await db.insertSessionExerciseSet({ session_exercise_id: LOCAL + 1, set_number: 2, weight: 135, reps: 5, is_warmup: false });
  await db.updateSessionExerciseSet(LOCAL + 9, { completed: true });
  expect(mockLocal.insertSessionExerciseSet).toHaveBeenCalled();
  expect(mockLocal.updateSessionExerciseSet).toHaveBeenCalledWith(LOCAL + 9, { completed: true });
  expect(touched).toEqual([]);
});

it("reads an offline-started workout from the device, not the server cache", async () => {
  mockStore["@gym_tracker_cache:sessionExercises:" + LOCAL] = JSON.stringify([{ stale: true }]);
  const { data } = await db.getSessionExercises(LOCAL);
  expect(data[0].exercise_id).toBe("bench");
  expect(touched).toEqual([]);
});

it("sends server workouts to Supabase as before", async () => {
  await db.updateSessionExerciseSet(55, { completed: true });
  expect(touched).toEqual(["session_exercise_sets"]);
  expect(mockLocal.updateSessionExerciseSet).not.toHaveBeenCalled();
});

it("resumes the unfinished offline workout ahead of the server", async () => {
  mockLocal.getActiveSession.mockResolvedValueOnce({ data: { session_id: LOCAL, end_time: null }, error: null });
  const { data } = await db.getActiveSession("u1");
  expect(data.session_id).toBe(LOCAL);
  expect(touched).toEqual([]);
});

it("queues an offline-started workout finished online instead of losing it", async () => {
  await db.finishWorkoutSession(LOCAL, null);
  await new Promise((r) => setTimeout(r, 0)); // let the immediate sync attempt run
  expect(mockLocal.finishWorkoutSession).toHaveBeenCalledWith(LOCAL, null);
  // The stub server returns no row, so the upload fails and it stays queued.
  const queue = JSON.parse(mockStore["@gym_tracker_offline_sessions"] ?? "[]");
  expect(queue).toHaveLength(1);
  expect(queue[0].session.session_name).toBe("Gym");
  expect(queue[0].sets[0]).toMatchObject({ weight: 135, reps: 5 });
  // It tried to upload right away instead of waiting for a reconnect.
  expect(touched).toContain("workout_sessions");
});

it("queues a finished offline workout that never reached the queue before dropping it", async () => {
  mockNet.isConnected = false;
  mockFinished = [LOCAL];
  const { initLocalStore } = require("../backend/db");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { removeLocalSessions } = require("../backend/localDb");
  await initLocalStore();
  const queue = JSON.parse(mockStore["@gym_tracker_offline_sessions"] ?? "[]");
  expect(queue).toHaveLength(1);
  expect(queue[0].local_session_id).toBe(LOCAL);
  expect(removeLocalSessions).toHaveBeenCalledWith([LOCAL]);

  // Running again doesn't queue it twice.
  await initLocalStore();
  expect(JSON.parse(mockStore["@gym_tracker_offline_sessions"])).toHaveLength(1);
});

it("adds a photo taken after finishing to the queued copy", async () => {
  mockNet.isConnected = false;
  await db.finishWorkoutSession(LOCAL, null);
  mockLocal.updateSessionPhotoUrl = jest.fn(async () => ({ error: null }));
  await db.updateSessionPhotoUrl(LOCAL, "progress-photos/u1/x.jpg");
  const queue = JSON.parse(mockStore["@gym_tracker_offline_sessions"]);
  expect(queue[0].session.photo_url).toBe("progress-photos/u1/x.jpg");
});
