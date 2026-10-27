import { renderHook, act, waitFor } from "@testing-library/react-native";
import NetInfo from "@react-native-community/netinfo";
import { db } from "../backend/db";
import { useSyncManager } from "../utils/useSyncManager";

// ─── Mocks ────────────────────────────────────────────────────────────────────
// NetInfo is a native module — mock its two methods used by the hook.

jest.mock("@react-native-community/netinfo", () => ({
  fetch: jest.fn(),
  addEventListener: jest.fn(),
}));

// db is mocked so we control what "pending sessions" and "sync" return.
// isOnline is set to true so the hook's early-return guard does not fire.
jest.mock("../backend/db", () => ({
  isOnline: true,
  db: {
    getPendingSessionCount: jest.fn(),
    syncPendingSessions: jest.fn(),
  },
}));

const mockFetch = NetInfo.fetch as jest.Mock;
const mockAddEventListener = NetInfo.addEventListener as jest.Mock;
const mockGetPendingCount = db.getPendingSessionCount as jest.Mock;
const mockSync = db.syncPendingSessions as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  // Safe defaults: online, nothing pending, sync succeeds with 0 synced
  mockFetch.mockResolvedValue({ isConnected: true, isInternetReachable: true });
  mockAddEventListener.mockReturnValue(jest.fn()); // returns unsubscribe fn
  mockGetPendingCount.mockResolvedValue(0);
  mockSync.mockResolvedValue({ synced: 0, errors: 0 });
});

// ─── Initial state ────────────────────────────────────────────────────────────

describe("useSyncManager — initial state", () => {
  it("returns isSyncing=false and lastSyncedCount=0 before any effect runs", () => {
    const { result } = renderHook(() => useSyncManager(null));
    expect(result.current.isSyncing).toBe(false);
    expect(result.current.lastSyncedCount).toBe(0);
  });
});

// ─── userId guard ─────────────────────────────────────────────────────────────

describe("useSyncManager — userId guard", () => {
  it("does not call any db or network functions when userId is null", async () => {
    renderHook(() => useSyncManager(null));
    await act(async () => {});
    expect(mockGetPendingCount).not.toHaveBeenCalled();
    expect(mockSync).not.toHaveBeenCalled();
    expect(mockAddEventListener).not.toHaveBeenCalled();
  });
});

// ─── Startup sync ─────────────────────────────────────────────────────────────

describe("useSyncManager — startup sync", () => {
  it("does not sync when there are no pending sessions", async () => {
    mockGetPendingCount.mockResolvedValue(0);

    renderHook(() => useSyncManager("user-1"));
    await act(async () => {});

    expect(mockSync).not.toHaveBeenCalled();
  });

  it("does not sync when pending sessions exist but network is disconnected", async () => {
    mockGetPendingCount.mockResolvedValue(2);
    mockFetch.mockResolvedValue({ isConnected: false, isInternetReachable: false });

    renderHook(() => useSyncManager("user-1"));
    await act(async () => {});

    expect(mockSync).not.toHaveBeenCalled();
  });

  it("does not sync when isInternetReachable is false even if isConnected is true", async () => {
    mockGetPendingCount.mockResolvedValue(1);
    mockFetch.mockResolvedValue({ isConnected: true, isInternetReachable: false });

    renderHook(() => useSyncManager("user-1"));
    await act(async () => {});

    expect(mockSync).not.toHaveBeenCalled();
  });

  it("syncs on mount when pending sessions exist and network is reachable", async () => {
    mockGetPendingCount.mockResolvedValue(3);
    mockFetch.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    mockSync.mockResolvedValue({ synced: 3, errors: 0 });

    const { result } = renderHook(() => useSyncManager("user-1"));

    await waitFor(() => expect(result.current.lastSyncedCount).toBe(3));
    expect(result.current.isSyncing).toBe(false);
    expect(mockSync).toHaveBeenCalledWith("user-1");
  });

  it("does not update lastSyncedCount when sync reports 0 sessions synced", async () => {
    mockGetPendingCount.mockResolvedValue(1);
    mockFetch.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    mockSync.mockResolvedValue({ synced: 0, errors: 1 });

    const { result } = renderHook(() => useSyncManager("user-1"));
    await waitFor(() => expect(mockSync).toHaveBeenCalled());

    expect(result.current.lastSyncedCount).toBe(0);
    expect(result.current.isSyncing).toBe(false);
  });
});

// ─── Reconnect sync ───────────────────────────────────────────────────────────

describe("useSyncManager — reconnect sync", () => {
  it("syncs when the network transitions from disconnected to connected", async () => {
    let listener: ((state: any) => void) | null = null;
    mockAddEventListener.mockImplementation((cb: (state: any) => void) => {
      listener = cb;
      return jest.fn();
    });
    mockGetPendingCount.mockResolvedValue(0); // no startup sync
    mockSync.mockResolvedValue({ synced: 2, errors: 0 });

    const { result } = renderHook(() => useSyncManager("user-1"));
    await waitFor(() => expect(listener).not.toBeNull());

    // Simulate disconnect, then reconnect
    await act(async () => {
      listener!({ isConnected: false, isInternetReachable: false });
    });
    await act(async () => {
      listener!({ isConnected: true, isInternetReachable: true });
    });

    await waitFor(() => expect(result.current.lastSyncedCount).toBe(2));
    expect(mockSync).toHaveBeenCalledWith("user-1");
  });

  it("does not sync when the network was already connected (true → true)", async () => {
    let listener: ((state: any) => void) | null = null;
    mockAddEventListener.mockImplementation((cb: (state: any) => void) => {
      listener = cb;
      return jest.fn();
    });
    mockGetPendingCount.mockResolvedValue(0);

    renderHook(() => useSyncManager("user-1"));
    await waitFor(() => expect(listener).not.toBeNull());

    // Fire two consecutive "connected" events — no disconnect in between
    await act(async () => {
      listener!({ isConnected: true, isInternetReachable: true });
    });
    await act(async () => {
      listener!({ isConnected: true, isInternetReachable: true });
    });

    expect(mockSync).not.toHaveBeenCalled();
  });

  it("does not sync when transitioning from connected to disconnected", async () => {
    let listener: ((state: any) => void) | null = null;
    mockAddEventListener.mockImplementation((cb: (state: any) => void) => {
      listener = cb;
      return jest.fn();
    });
    mockGetPendingCount.mockResolvedValue(0);

    renderHook(() => useSyncManager("user-1"));
    await waitFor(() => expect(listener).not.toBeNull());

    await act(async () => {
      listener!({ isConnected: true, isInternetReachable: true });
    });
    await act(async () => {
      listener!({ isConnected: false, isInternetReachable: false });
    });

    expect(mockSync).not.toHaveBeenCalled();
  });
});

// ─── Cleanup ──────────────────────────────────────────────────────────────────

describe("useSyncManager — cleanup", () => {
  it("calls the unsubscribe function returned by addEventListener on unmount", async () => {
    const mockUnsubscribe = jest.fn();
    mockAddEventListener.mockReturnValue(mockUnsubscribe);
    mockGetPendingCount.mockResolvedValue(0);

    const { unmount } = renderHook(() => useSyncManager("user-1"));
    await act(async () => {});

    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
