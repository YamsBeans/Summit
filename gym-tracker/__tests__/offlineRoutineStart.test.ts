// Starting a routine with no signal must work from the cached copy of the routine.

const mockNet = { isConnected: false };
const mockStore: Record<string, string> = {};
let mockNextId = 1;
const mockLocal = {
  startWorkoutSession: jest.fn(async (p: any) => ({ data: { session_id: 500, ...p }, error: null })),
  insertSessionExercise: jest.fn(async (e: any) => ({ data: { session_exercise_id: mockNextId++, ...e }, error: null })),
  insertSessionExerciseSet: jest.fn(async (s: any) => ({ data: s, error: null })),
  startWorkoutFromRoutine: jest.fn(async () => ({ data: null, error: { message: "Routine not found" } })),
  getRoutines: jest.fn(async () => ({ data: [], error: null })),
  getRoutineExercises: jest.fn(async () => ({ data: [], error: null })),
  getRoutineExerciseSets: jest.fn(async () => ({ data: [], error: null })),
};

jest.mock("../backend/supabaseClient", () => ({ supabase: { auth: {} } }));
jest.mock("../backend/networkStatus", () => ({ networkStatus: mockNet }));
jest.mock("../backend/localDb", () => ({ localDb: mockLocal }));
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

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  mockNextId = 1;
});

it("builds the session from the cached routine, exercises and template sets", async () => {
  mockStore[C + "routines"] = JSON.stringify([{ routine_id: 7, routine_name: "Push Day" }]);
  mockStore[C + "routineExercises:7"] = JSON.stringify([
    { routine_exercise_id: 2, exercise_id: "ohp", exercise_name: "OHP", exercise_order: 2, exercise_type: "strength" },
    { routine_exercise_id: 1, exercise_id: "bench", exercise_name: "Bench", exercise_order: 1, exercise_type: "strength" },
  ]);
  mockStore[C + "routineExerciseSets:1"] = JSON.stringify([
    { set_number: 2, target_weight: 185, target_reps: 5, is_warmup: false },
    { set_number: 1, target_weight: 135, target_reps: 10, is_warmup: true },
  ]);

  const { data, error } = await db.startWorkoutFromRoutine(7, "user-1");

  expect(error).toBeNull();
  expect(data.session_id).toBe(500);
  expect(mockLocal.startWorkoutSession).toHaveBeenCalledWith({ routine_id: 7, session_name: "Push Day", user_id: "user-1" });
  expect(mockLocal.insertSessionExercise.mock.calls.map((c: any) => c[0].exercise_id)).toEqual(["bench", "ohp"]);
  const sets = mockLocal.insertSessionExerciseSet.mock.calls.map((c: any) => c[0]);
  expect(sets[0]).toMatchObject({ set_number: 1, weight: 135, reps: 10, is_warmup: true });
  expect(sets[1]).toMatchObject({ set_number: 2, weight: 185, reps: 5 });
  // OHP had no cached template: one empty set to log into.
  expect(sets[2]).toMatchObject({ set_number: 1, weight: null, reps: null });
  expect(mockLocal.startWorkoutFromRoutine).not.toHaveBeenCalled();
});

it("falls back to the local store when the routine isn't cached", async () => {
  const res = await db.startWorkoutFromRoutine(9, "user-1");
  expect(mockLocal.startWorkoutFromRoutine).toHaveBeenCalledWith(9, "user-1");
  expect(res.error).toEqual({ message: "Routine not found" });
});
