// Signed-in Supabase users must stay signed in while the phone is offline.

const mockGetSession = jest.fn();
const mockGetUser = jest.fn();
const mockSignOut = jest.fn();
const mockSignIn = jest.fn();
const mockNet = { isConnected: true };
const mockLocal = { getUser: jest.fn(), getSession: jest.fn(), signIn: jest.fn(), signUp: jest.fn(), signOut: jest.fn() };

jest.mock("../backend/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      getUser: mockGetUser,
      signOut: mockSignOut,
      signInWithPassword: mockSignIn,
    },
  },
}));
jest.mock("../backend/networkStatus", () => ({ networkStatus: mockNet }));
jest.mock("../backend/localDb", () => ({ localDb: mockLocal }));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiRemove: jest.fn(),
}));
jest.mock("expo-linking", () => ({ createURL: (p: string) => p }));

process.env.EXPO_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "anon";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require("../backend/db");

const user = { id: "u1", email: "a@b.c" };

beforeEach(() => {
  jest.clearAllMocks();
  mockNet.isConnected = true;
  mockGetSession.mockResolvedValue({ data: { session: { user } }, error: null });
  mockGetUser.mockResolvedValue({ data: { user }, error: null });
});

describe("auth while offline (Supabase configured)", () => {
  it("getUser reads the persisted session instead of the empty local store", async () => {
    mockNet.isConnected = false;
    const { data } = await db.getUser();
    expect(data.user).toEqual(user);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockLocal.getUser).not.toHaveBeenCalled();
  });

  it("getUser falls back to the session when the network call fails", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "TypeError: Network request failed" } });
    const { data } = await db.getUser();
    expect(data.user).toEqual(user);
  });

  it("getUser passes real auth errors through", async () => {
    const err = { message: "Auth session missing!" };
    mockGetUser.mockResolvedValue({ data: { user: null }, error: err });
    const res = await db.getUser();
    expect(res.error).toBe(err);
  });

  it("getSession uses Supabase even when offline", async () => {
    mockNet.isConnected = false;
    const { data } = await db.getSession();
    expect(data.session.user).toEqual(user);
    expect(mockLocal.getSession).not.toHaveBeenCalled();
  });

  it("does not create a local-only account when signing in offline", async () => {
    mockNet.isConnected = false;
    const res = await db.signIn("a@b.c", "pw");
    expect(res.error?.message).toMatch(/offline/i);
    expect(mockLocal.signIn).not.toHaveBeenCalled();
    const up = await db.signUp("a@b.c", "pw", "a");
    expect(up.error?.message).toMatch(/offline/i);
    expect(mockLocal.signUp).not.toHaveBeenCalled();
  });

  it("signs out locally when offline", async () => {
    mockNet.isConnected = false;
    await db.signOut();
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
