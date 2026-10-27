// Tests for private progress-photo links and password-reset link handling in backend/db.

const mockCreateSignedUrl = jest.fn();
const mockSetSession = jest.fn();
const mockExchangeCode = jest.fn();

jest.mock("../backend/supabaseClient", () => ({
  supabase: {
    storage: { from: () => ({ createSignedUrl: mockCreateSignedUrl }) },
    auth: { setSession: mockSetSession, exchangeCodeForSession: mockExchangeCode },
  },
}));
jest.mock("../backend/networkStatus", () => ({ networkStatus: { isConnected: true } }));
jest.mock("../backend/localDb", () => ({ localDb: {} }));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}));
jest.mock("expo-linking", () => ({ createURL: (p: string) => `gymtracker://${p.replace(/^\//, "")}` }));

process.env.EXPO_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "anon";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require("../backend/db");

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed/url" }, error: null });
  mockSetSession.mockResolvedValue({ error: null });
  mockExchangeCode.mockResolvedValue({ error: null });
});

describe("getProgressPhotoUrl", () => {
  it("returns null for empty values", async () => {
    expect(await db.getProgressPhotoUrl(null)).toBeNull();
    expect(await db.getProgressPhotoUrl("")).toBeNull();
  });

  it("signs private storage paths, ignoring the ?v= cache buster", async () => {
    const url = await db.getProgressPhotoUrl("progress-photos/user-1/42.jpg?v=111");
    expect(url).toBe("https://signed/url");
    expect(mockCreateSignedUrl).toHaveBeenCalledWith("user-1/42.jpg", 3600);
  });

  it("signs old public links so existing photos keep working", async () => {
    await db.getProgressPhotoUrl(
      "https://example.supabase.co/storage/v1/object/public/progress-photos/user-1/7.png?t=999"
    );
    expect(mockCreateSignedUrl).toHaveBeenCalledWith("user-1/7.png", 3600);
  });

  it("reuses a signed link instead of signing again", async () => {
    await db.getProgressPhotoUrl("progress-photos/user-1/9.jpg?v=1");
    await db.getProgressPhotoUrl("progress-photos/user-1/9.jpg?v=1");
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1);
  });

  it("returns local offline photos unchanged", async () => {
    expect(await db.getProgressPhotoUrl("file:///photos/a.jpg")).toBe("file:///photos/a.jpg");
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  it("returns null when signing fails", async () => {
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: { message: "not found" } });
    expect(await db.getProgressPhotoUrl("progress-photos/user-1/missing.jpg?v=2")).toBeNull();
  });
});

describe("recoverSessionFromUrl", () => {
  it("signs in from tokens in the link fragment", async () => {
    const result = await db.recoverSessionFromUrl(
      "gymtracker://reset-password#access_token=abc&refresh_token=def&type=recovery"
    );
    expect(result.error).toBeNull();
    expect(mockSetSession).toHaveBeenCalledWith({ access_token: "abc", refresh_token: "def" });
  });

  it("signs in from a ?code= link", async () => {
    const result = await db.recoverSessionFromUrl("https://summit.app/reset-password?code=xyz");
    expect(result.error).toBeNull();
    expect(mockExchangeCode).toHaveBeenCalledWith("xyz");
  });

  it("reports errors Supabase puts in the link", async () => {
    const result = await db.recoverSessionFromUrl(
      "gymtracker://reset-password#error=access_denied&error_description=Email+link+is+invalid+or+has+expired"
    );
    expect(result.error).toBe("Email link is invalid or has expired");
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it("rejects links with no tokens", async () => {
    const result = await db.recoverSessionFromUrl("gymtracker://reset-password");
    expect(result.error).toMatch(/invalid or has expired/);
  });
});
