// Finishing a routine workout offline (signed in) must queue the routine's
// new targets instead of reading the empty device store and doing nothing.

const mockNet = { isConnected: false };
const mockStore: Record<string, string> = {};
const LOCAL = 2e12;
const mockLocal = {
  getSessionExercises: jest.fn(async () => ({ data: [
    { session_exercise_id: LOCAL + 1, session_id: LOCAL, exercise_id: "squat", exercise_order: 1, exercise_type: "strength" },
    { session_exercise_id: LOCAL + 2, session_id: LOCAL, exercise_id: "squat", exercise_order: 2, exercise_type: "strength" },
  ], error: null })),
  getSessionExerciseSets: jest.fn(async (id: number) => ({ data: id === LOCAL + 1
    ? [{ set_number: 1, weight: 235, reps: 5, completed: true }, { set_number: 2, weight: 240, reps: 5, completed: false }]
    : [{ set_number: 1, weight: 145, reps: 10, completed: true }], error: null })),
  getRoutineExercises: jest.fn(async () => ({ data: [], error: null })),
  getRoutineExerciseSets: jest.fn(async () => ({ data: [], error: null })),
  updateRoutineExerciseSet: jest.fn(),
};

jest.mock("../backend/supabaseClient", () => ({ supabase: { auth: {} } }));
jest.mock("../backend/networkStatus", () => ({ networkStatus: mockNet }));
jest.mock("../backend/localDb", () => ({ localDb: mockLocal, isLocalId: (id: any) => typeof id === "number" && id >= 1e12, loadLocalDb: async () => {} }));
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

const C = "@gym_tracker_cache:";

it("queues target updates for each instance's own template, and patches the cache", async () => {
  mockStore[C + "routineExercises:7"] = JSON.stringify([
    { routine_exercise_id: 70, exercise_id: "squat", exercise_order: 1 },
    { routine_exercise_id: 71, exercise_id: "squat", exercise_order: 2 },
  ]);
  mockStore[C + "routineExerciseSets:70"] = JSON.stringify([
    { routine_set_id: 700, set_number: 1, target_weight: 225, target_reps: 5 },
    { routine_set_id: 701, set_number: 2, target_weight: 225, target_reps: 5 },
  ]);
  mockStore[C + "routineExerciseSets:71"] = JSON.stringify([
    { routine_set_id: 710, set_number: 1, target_weight: 135, target_reps: 10 },
  ]);

  await db.syncSessionSetsToRoutine(LOCAL, 7);

  const ops = JSON.parse(mockStore["@gym_tracker_outbox"] ?? "[]");
  expect(ops.map((o: any) => [o.table, o.kind, o.id, o.values])).toEqual([
    ["routine_exercise_sets", "update", 700, { target_weight: 235, target_reps: 5 }],
    ["routine_exercise_sets", "update", 710, { target_weight: 145, target_reps: 10 }],
  ]);
  const cached70 = JSON.parse(mockStore[C + "routineExerciseSets:70"]);
  expect(cached70[0]).toMatchObject({ target_weight: 235 });
  expect(cached70[1]).toMatchObject({ target_weight: 225 }); // unticked set untouched
  expect(mockLocal.updateRoutineExerciseSet).not.toHaveBeenCalled();
});
