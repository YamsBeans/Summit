// Recomputing records after an edit may lower them, so it must never run
// against a server copy that's missing changes (offline, or still uploading).

const mockNet = { isConnected: false };
const mockStore: Record<string, string> = {};
// Chainable query builder: every method returns the builder, awaiting it
// resolves to the table's canned result.
const mockResults: Record<string, any> = {};
const mockUpserts: any[] = [];
const mockFrom = jest.fn((table: string) => {
  const builder: any = new Proxy({}, {
    get(_t, prop) {
      if (prop === "then") return (res: any, rej: any) => Promise.resolve(mockResults[table] ?? { data: [], error: null }).then(res, rej);
      if (prop === "upsert") return (values: any) => { mockUpserts.push({ table, values }); return builder; };
      return () => builder;
    },
  });
  return builder;
});
const mockLocal = {
  upsertPersonalRecord: jest.fn(async () => ({ error: null })),
  getPersonalRecords: jest.fn(async () => ({ data: [], error: null })),
  getExerciseHistory: jest.fn(async () => ({ data: [], error: null })),
};

const mockAuth = { user: "u1" as string | null };
jest.mock("../backend/supabaseClient", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: mockAuth.user ? { user: { id: mockAuth.user } } : null } }) },
    from: (t: string) => mockFrom(t),
  },
}));
jest.mock("../backend/networkStatus", () => ({ networkStatus: mockNet }));
jest.mock("../backend/localDb", () => ({ localDb: mockLocal, isLocalId: () => false, loadLocalDb: async () => {} }));
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

it("does nothing while offline in a Supabase build", async () => {
  mockNet.isConnected = false;
  await db.rebuildStrengthRecords("u1", ["bench"]);
  expect(mockFrom).not.toHaveBeenCalled();
  expect(mockLocal.upsertPersonalRecord).not.toHaveBeenCalled();
});

describe("online", () => {
  beforeEach(() => {
    mockNet.isConnected = true;
    mockUpserts.length = 0;
    for (const k of Object.keys(mockResults)) delete mockResults[k];
  });

  it("lowers a record to what history shows", async () => {
    mockResults.personal_records = { data: [{ exercise_id: "bench", pr_type: "strength", max_weight: 2250, max_volume: 11250 }], error: null };
    mockResults.session_exercises = { data: [{ session_exercise_id: 7, workout_sessions: { session_id: 1, session_date: "2026-11-01" } }], error: null };
    mockResults.session_exercise_sets = { data: [{ session_exercise_id: 7, weight: 225, reps: 5, completed: true }], error: null };
    await db.rebuildStrengthRecords("u1", ["bench"]);
    const write = mockUpserts.find((u) => u.table === "personal_records");
    expect(write.values).toMatchObject({ exercise_id: "bench", max_weight: 225, max_volume: 1125 });
  });

  it("catches up on exercises edited while offline", async () => {
    mockNet.isConnected = false;
    await db.rebuildStrengthRecords("u1", ["squat"]);
    mockNet.isConnected = true;
    mockResults.personal_records = { data: [{ exercise_id: "squat", pr_type: "strength", max_weight: 999, max_volume: 999 }], error: null };
    mockResults.session_exercises = { data: [{ session_exercise_id: 8, workout_sessions: { session_id: 2, session_date: "2026-11-01" } }], error: null };
    mockResults.session_exercise_sets = { data: [{ session_exercise_id: 8, weight: 315, reps: 3, completed: true }], error: null };
    // e.g. called after a sync, with nothing new
    await db.rebuildStrengthRecords("u1", []);
    expect(mockUpserts.find((u) => u.table === "personal_records")?.values).toMatchObject({ exercise_id: "squat", max_weight: 315 });
    mockUpserts.length = 0;
    await db.rebuildStrengthRecords("u1", []);
    expect(mockUpserts).toEqual([]);
  });

  it("waits when another account is signed in now, keeping the list to fix", async () => {
    mockAuth.user = "u2";
    try {
      await db.rebuildStrengthRecords("u1", ["deadlift"]);
    } finally {
      mockAuth.user = "u1";
    }
    expect(mockUpserts).toEqual([]);
    mockResults.personal_records = { data: [{ exercise_id: "deadlift", pr_type: "strength", max_weight: 900, max_volume: 900 }], error: null };
    mockResults.session_exercises = { data: [{ session_exercise_id: 9, workout_sessions: { session_id: 3, session_date: "2026-11-01" } }], error: null };
    mockResults.session_exercise_sets = { data: [{ session_exercise_id: 9, weight: 405, reps: 1, completed: true }], error: null };
    await db.rebuildStrengthRecords("u1", []);
    expect(mockUpserts.find((u) => u.table === "personal_records")?.values).toMatchObject({ exercise_id: "deadlift", max_weight: 405 });
  });

  it("isn't blocked by another account's workout waiting to upload", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const queue = require("../backend/offlineQueue");
    await queue.enqueuePendingSession({
      local_session_id: 1e12 + 9,
      session: { routine_id: null, session_name: "A's", session_date: "2026-11-09", start_time: "18:00:00", end_time: "19:00:00", notes: null, user_id: "someone-else" },
      exercises: [], sets: [],
    });
    mockResults.personal_records = { data: [{ exercise_id: "bench", pr_type: "strength", max_weight: 2250, max_volume: 11250 }], error: null };
    mockResults.session_exercises = { data: [{ session_exercise_id: 7, workout_sessions: { session_id: 1, session_date: "2026-11-01" } }], error: null };
    mockResults.session_exercise_sets = { data: [{ session_exercise_id: 7, weight: 225, reps: 5, completed: true }], error: null };
    await db.rebuildStrengthRecords("u1", ["bench"]);
    expect(mockUpserts.find((u) => u.table === "personal_records")?.values).toMatchObject({ max_weight: 225 });
  });

  it("never writes when the history read fails", async () => {
    mockResults.personal_records = { data: [{ exercise_id: "bench", pr_type: "strength", max_weight: 300, max_volume: 3000 }], error: null };
    mockResults.session_exercises = { data: null, error: { message: "statement timeout" } };
    await db.rebuildStrengthRecords("u1", ["bench"]);
    expect(mockUpserts).toEqual([]);
  });
});
