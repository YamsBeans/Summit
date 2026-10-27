import {
  enqueuePendingSession,
  getPendingQueue,
  getPendingCount,
  removeFromQueue,
  markSessionOrigin,
  getSessionOrigin,
  clearSessionOrigin,
  PendingSession,
} from "../backend/offlineQueue";

// ─── AsyncStorage mock ────────────────────────────────────────────────────────
// Use jest.fn() stubs and wire up a real in-memory store in beforeEach so each
// test starts with a clean slate.

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const AsyncStorage = require("@react-native-async-storage/async-storage");

let mockStorage: Record<string, string> = {};

beforeEach(() => {
  mockStorage = {};
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
  jest.clearAllMocks();
  // Re-apply implementations after clearAllMocks resets them
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
});

// ─── Test data helper ─────────────────────────────────────────────────────────

function makeSession(name = "Test Workout"): PendingSession {
  return {
    session: {
      routine_id: null,
      session_name: name,
      session_date: "2026-03-30",
      start_time: "10:00:00",
      end_time: "11:00:00",
      notes: null,
      user_id: "user-1",
    },
    exercises: [
      {
        session_exercise_id: 1,
        exercise_id: "bench-press",
        exercise_name: "Bench Press",
        exercise_order: 1,
        notes: null,
        exercise_type: "strength",
      },
    ],
    sets: [
      {
        session_exercise_id: 1,
        set_number: 1,
        weight: 100,
        reps: 10,
        is_warmup: false,
        completed: true,
        duration_seconds: null,
        distance_meters: null,
        pace_sec_per_km: null,
        calories: null,
        effort_level: null,
      },
    ],
  };
}

// ─── getPendingQueue ──────────────────────────────────────────────────────────

describe("getPendingQueue", () => {
  it("returns an empty array when nothing has been queued", async () => {
    const queue = await getPendingQueue();
    expect(queue).toEqual([]);
  });

  it("returns the queued sessions after enqueue", async () => {
    await enqueuePendingSession(makeSession("Leg Day"));
    const queue = await getPendingQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].session.session_name).toBe("Leg Day");
  });
});

// ─── enqueuePendingSession ────────────────────────────────────────────────────

describe("enqueuePendingSession", () => {
  it("adds a session to an empty queue", async () => {
    await enqueuePendingSession(makeSession());
    expect(await getPendingCount()).toBe(1);
  });

  it("appends to an existing queue without overwriting earlier entries", async () => {
    await enqueuePendingSession(makeSession("Session A"));
    await enqueuePendingSession(makeSession("Session B"));

    const queue = await getPendingQueue();
    expect(queue).toHaveLength(2);
    expect(queue[0].session.session_name).toBe("Session A");
    expect(queue[1].session.session_name).toBe("Session B");
  });

  it("preserves the full exercise and set data for each session", async () => {
    await enqueuePendingSession(makeSession());
    const [queued] = await getPendingQueue();

    expect(queued.exercises).toHaveLength(1);
    expect(queued.exercises[0].exercise_name).toBe("Bench Press");
    expect(queued.sets).toHaveLength(1);
    expect(queued.sets[0].weight).toBe(100);
    expect(queued.sets[0].reps).toBe(10);
  });

  it("handles sessions with no exercises or sets", async () => {
    const empty: PendingSession = { ...makeSession(), exercises: [], sets: [] };
    await enqueuePendingSession(empty);
    const [queued] = await getPendingQueue();
    expect(queued.exercises).toEqual([]);
    expect(queued.sets).toEqual([]);
  });
});

// ─── getPendingCount ──────────────────────────────────────────────────────────

describe("getPendingCount", () => {
  it("returns 0 when the queue is empty", async () => {
    expect(await getPendingCount()).toBe(0);
  });

  it("increments with each enqueued session", async () => {
    await enqueuePendingSession(makeSession());
    expect(await getPendingCount()).toBe(1);
    await enqueuePendingSession(makeSession());
    expect(await getPendingCount()).toBe(2);
    await enqueuePendingSession(makeSession());
    expect(await getPendingCount()).toBe(3);
  });
});

// ─── removeFromQueue ──────────────────────────────────────────────────────────

describe("removeFromQueue", () => {
  it("removes the session at the specified index", async () => {
    await enqueuePendingSession(makeSession("A"));
    await enqueuePendingSession(makeSession("B"));
    await enqueuePendingSession(makeSession("C"));

    await removeFromQueue([1]); // remove 'B'

    const queue = await getPendingQueue();
    expect(queue).toHaveLength(2);
    expect(queue[0].session.session_name).toBe("A");
    expect(queue[1].session.session_name).toBe("C");
  });

  it("removes multiple indices at once preserving order of the rest", async () => {
    for (const name of ["A", "B", "C", "D"]) {
      await enqueuePendingSession(makeSession(name));
    }

    await removeFromQueue([0, 2]); // remove A and C

    const queue = await getPendingQueue();
    expect(queue).toHaveLength(2);
    expect(queue.map((s) => s.session.session_name)).toEqual(["B", "D"]);
  });

  it("removes the AsyncStorage key entirely when the queue becomes empty", async () => {
    await enqueuePendingSession(makeSession());
    await removeFromQueue([0]);

    expect(await getPendingCount()).toBe(0);
    expect(AsyncStorage.removeItem).toHaveBeenCalled();
    // Should not persist an empty array — the key is deleted
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
      expect.any(String),
      "[]"
    );
  });

  it("is a no-op when called with an empty indices array", async () => {
    await enqueuePendingSession(makeSession());
    await removeFromQueue([]);
    expect(await getPendingCount()).toBe(1);
  });
});

// ─── session origin tracking ──────────────────────────────────────────────────

describe("session origin tracking", () => {
  it("returns null when no origin has been stored", async () => {
    const origin = await getSessionOrigin();
    expect(origin).toBeNull();
  });

  it("stores and retrieves a local-origin session", async () => {
    await markSessionOrigin(42, true);
    const origin = await getSessionOrigin();
    expect(origin).toEqual({ sessionId: 42, isLocal: true });
  });

  it("stores and retrieves an online-origin session", async () => {
    await markSessionOrigin(99, false);
    const origin = await getSessionOrigin();
    expect(origin).toEqual({ sessionId: 99, isLocal: false });
  });

  it("overwrites a previous origin when called again", async () => {
    await markSessionOrigin(1, true);
    await markSessionOrigin(2, false);
    const origin = await getSessionOrigin();
    expect(origin).toEqual({ sessionId: 2, isLocal: false });
  });

  it("clears the stored origin so getSessionOrigin returns null", async () => {
    await markSessionOrigin(10, true);
    await clearSessionOrigin();
    const origin = await getSessionOrigin();
    expect(origin).toBeNull();
  });
});
