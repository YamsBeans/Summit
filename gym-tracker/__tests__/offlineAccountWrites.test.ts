// Signed-in users offline: routine/profile/custom-exercise writes have no
// outbox, so they must fail loudly instead of landing in the unsynced
// on-device store.

const mockNet = { isConnected: false };
const mockLocal = {
  insertRoutine: jest.fn(async () => ({ data: { routine_id: 1 }, error: null })),
  updateRoutineExerciseSet: jest.fn(async () => ({ data: null, error: null })),
  insertCustomExercise: jest.fn(async () => ({ data: null, error: null })),
  updateUserProfile: jest.fn(async () => ({ data: null, error: null })),
};

jest.mock("../backend/supabaseClient", () => ({ supabase: { auth: {} } }));
jest.mock("../backend/networkStatus", () => ({ networkStatus: mockNet }));
jest.mock("../backend/localDb", () => ({ localDb: mockLocal, isLocalId: () => false, loadLocalDb: async () => {} }));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiRemove: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-linking", () => ({ createURL: (p: string) => p }));

process.env.EXPO_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "anon";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db, OFFLINE_EDIT_MESSAGE } = require("../backend/db");

beforeEach(() => jest.clearAllMocks());

it.each([
  ["insertRoutine", () => db.insertRoutine({ routine_name: "A", description: null, user_id: "u" })],
  ["updateRoutineExerciseSet", () => db.updateRoutineExerciseSet(3, { target_reps: 5 })],
  ["insertCustomExercise", () => db.insertCustomExercise({ exercise_id: "c", user_id: "u", name: "C", primary_muscle: null, equipment: null })],
  ["updateUserProfile", () => db.updateUserProfile("u", { username: "y" })],
])("%s returns an offline error and writes nothing locally", async (name, call) => {
  const { error } = await call();
  expect(error?.message).toBe(OFFLINE_EDIT_MESSAGE);
  expect((mockLocal as any)[name]).not.toHaveBeenCalled();
});
