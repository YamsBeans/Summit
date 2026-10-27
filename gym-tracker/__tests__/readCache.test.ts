import {
  writeCache,
  readCache,
  clearReadCache,
  cachedRead,
} from "../backend/readCache";

// ─── AsyncStorage mock ────────────────────────────────────────────────────────
// Mirror the in-memory-store pattern used by offlineQueue.test.ts.

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  getAllKeys: jest.fn(),
  multiRemove: jest.fn(),
}));

const AsyncStorage = require("@react-native-async-storage/async-storage");

const PREFIX = "@gym_tracker_cache:";

let mockStorage: Record<string, string> = {};

beforeEach(() => {
  mockStorage = {};
  jest.clearAllMocks();
  AsyncStorage.getItem.mockImplementation((key: string) =>
    Promise.resolve(mockStorage[key] ?? null)
  );
  AsyncStorage.setItem.mockImplementation((key: string, value: string) => {
    mockStorage[key] = value;
    return Promise.resolve();
  });
  AsyncStorage.removeItem.mockImplementation((key: string) => {
    delete mockStorage[key];
    return Promise.resolve();
  });
  AsyncStorage.getAllKeys.mockImplementation(() => Promise.resolve(Object.keys(mockStorage)));
  AsyncStorage.multiRemove.mockImplementation((keys: string[]) => {
    keys.forEach((k) => delete mockStorage[k]);
    return Promise.resolve();
  });
});

// ─── writeCache / readCache ────────────────────────────────────────────────────

describe("writeCache / readCache", () => {
  it("round-trips a value", async () => {
    await writeCache("routines", [{ routine_id: 1 }]);
    expect(await readCache("routines")).toEqual([{ routine_id: 1 }]);
  });

  it("namespaces keys under the cache prefix", async () => {
    await writeCache("routines", [1]);
    expect(mockStorage[PREFIX + "routines"]).toBe("[1]");
    expect(mockStorage["routines"]).toBeUndefined();
  });

  it("returns null for a missing key", async () => {
    expect(await readCache("nope")).toBeNull();
  });

  it("returns null (not throw) for corrupt JSON", async () => {
    mockStorage[PREFIX + "bad"] = "{not valid json";
    expect(await readCache("bad")).toBeNull();
  });
});

// ─── clearReadCache ─────────────────────────────────────────────────────────────

describe("clearReadCache", () => {
  it("removes cache keys but leaves unrelated keys intact", async () => {
    await writeCache("routines", [1]);
    await writeCache("personalRecords:u1", [2]);
    mockStorage["@gym_tracker_theme"] = "dark"; // unrelated app key

    await clearReadCache();

    expect(await readCache("routines")).toBeNull();
    expect(await readCache("personalRecords:u1")).toBeNull();
    expect(mockStorage["@gym_tracker_theme"]).toBe("dark");
  });
});

// ─── cachedRead ─────────────────────────────────────────────────────────────────

describe("cachedRead", () => {
  it("online: runs the query, caches the result, and returns it", async () => {
    const onlineFn = jest.fn().mockResolvedValue({ data: [1, 2], error: null });
    const offlineFn = jest.fn();

    const res = await cachedRead(true, "k", onlineFn, offlineFn);

    expect(res).toEqual({ data: [1, 2], error: null });
    expect(onlineFn).toHaveBeenCalledTimes(1);
    expect(offlineFn).not.toHaveBeenCalled();
    expect(await readCache("k")).toEqual([1, 2]);
  });

  it("online: caches an empty array result", async () => {
    const onlineFn = jest.fn().mockResolvedValue({ data: [], error: null });
    await cachedRead(true, "k", onlineFn, jest.fn());
    expect(await readCache("k")).toEqual([]);
  });

  it("online: does not cache when the query errors", async () => {
    const onlineFn = jest.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await cachedRead(true, "errkey", onlineFn, jest.fn());
    expect(res.error).toEqual({ message: "boom" });
    expect(await readCache("errkey")).toBeNull();
  });

  it("offline: serves cached data without calling the offline fallback", async () => {
    await writeCache("k", [{ cached: true }]);
    const onlineFn = jest.fn();
    const offlineFn = jest.fn();

    const res = await cachedRead(false, "k", onlineFn, offlineFn);

    expect(res).toEqual({ data: [{ cached: true }], error: null });
    expect(onlineFn).not.toHaveBeenCalled();
    expect(offlineFn).not.toHaveBeenCalled();
  });

  it("offline: falls back to the local store when nothing is cached", async () => {
    const onlineFn = jest.fn();
    const offlineFn = jest.fn().mockResolvedValue({ data: ["local"], error: null });

    const res = await cachedRead(false, "missing", onlineFn, offlineFn);

    expect(res).toEqual({ data: ["local"], error: null });
    expect(offlineFn).toHaveBeenCalledTimes(1);
    expect(onlineFn).not.toHaveBeenCalled();
  });
});
