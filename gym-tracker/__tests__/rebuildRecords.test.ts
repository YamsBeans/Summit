// Recomputing records after an edit may lower them, so it must never run
// against a server copy that's missing changes (offline, or still uploading).

const mockNet = { isConnected: false };
const mockStore: Record<string, string> = {};
const mockFrom = jest.fn();
const mockLocal = {
  upsertPersonalRecord: jest.fn(async () => ({ error: null })),
  getPersonalRecords: jest.fn(async () => ({ data: [], error: null })),
  getExerciseHistory: jest.fn(async () => ({ data: [], error: null })),
};

jest.mock("../backend/supabaseClient", () => ({ supabase: { auth: {}, from: (...a: any[]) => mockFrom(...a) } }));
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
