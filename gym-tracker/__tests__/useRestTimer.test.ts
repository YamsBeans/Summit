import { renderHook, act } from "@testing-library/react-native";
import { useRestTimer, __resetRestTimerForTests } from "../utils/useRestTimer";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));

const AsyncStorage = require("@react-native-async-storage/async-storage");

describe("useRestTimer", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    __resetRestTimerForTests();
    AsyncStorage.getItem.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─── Initial state ────────────────────────────────────────────────────────

  it("starts with remaining = 0 and isRunning = false", async () => {
    const { result } = renderHook(() => useRestTimer());
    await act(async () => {});
    expect(result.current.remaining).toBe(0);
    expect(result.current.isRunning).toBe(false);
  });

  it("uses 90 seconds as the default duration", async () => {
    const { result } = renderHook(() => useRestTimer());
    await act(async () => {});
    expect(result.current.duration).toBe(90);
  });

  it("restores saved duration from AsyncStorage on mount", async () => {
    AsyncStorage.getItem.mockResolvedValue("120");
    const { result } = renderHook(() => useRestTimer());
    await act(async () => {});
    expect(result.current.duration).toBe(120);
  });

  // ─── start() ─────────────────────────────────────────────────────────────

  it("start(n) sets remaining to n and isRunning to true", async () => {
    const { result } = renderHook(() => useRestTimer());
    await act(async () => {});

    act(() => { result.current.start(10); });

    expect(result.current.remaining).toBe(10);
    expect(result.current.isRunning).toBe(true);
  });

  it("start() without argument uses the stored duration", async () => {
    const { result } = renderHook(() => useRestTimer());
    await act(async () => {});

    act(() => { result.current.start(); });

    expect(result.current.remaining).toBe(90); // default duration
  });

  // ─── Countdown behaviour ──────────────────────────────────────────────────

  it("decrements remaining by 1 each second", () => {
    const { result } = renderHook(() => useRestTimer());

    act(() => { result.current.start(5); });
    expect(result.current.remaining).toBe(5);

    act(() => { jest.advanceTimersByTime(1000); });
    expect(result.current.remaining).toBe(4);

    act(() => { jest.advanceTimersByTime(2000); });
    expect(result.current.remaining).toBe(2);
  });

  it("stops at 0 and sets isRunning to false when countdown completes", () => {
    const { result } = renderHook(() => useRestTimer());

    act(() => { result.current.start(3); });
    act(() => { jest.advanceTimersByTime(3000); });

    expect(result.current.remaining).toBe(0);
    expect(result.current.isRunning).toBe(false);
  });

  it("does not go below 0", () => {
    const { result } = renderHook(() => useRestTimer());

    act(() => { result.current.start(2); });
    act(() => { jest.advanceTimersByTime(10000); }); // way past the end

    expect(result.current.remaining).toBe(0);
  });

  // ─── onComplete callback ──────────────────────────────────────────────────

  it("fires the onComplete callback exactly once when timer reaches 0", () => {
    const { result } = renderHook(() => useRestTimer());
    const onComplete = jest.fn();

    act(() => {
      result.current.setOnComplete(onComplete);
      result.current.start(3);
    });
    act(() => { jest.advanceTimersByTime(3000); });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("does not fire onComplete if timer is skipped before completing", () => {
    const { result } = renderHook(() => useRestTimer());
    const onComplete = jest.fn();

    act(() => {
      result.current.setOnComplete(onComplete);
      result.current.start(10);
    });
    act(() => {
      jest.advanceTimersByTime(5000);
      result.current.skip();
    });

    expect(onComplete).not.toHaveBeenCalled();
  });

  // ─── skip() ───────────────────────────────────────────────────────────────

  it("skip() immediately sets remaining to 0 and isRunning to false", () => {
    const { result } = renderHook(() => useRestTimer());

    act(() => { result.current.start(60); });
    expect(result.current.isRunning).toBe(true);

    act(() => { result.current.skip(); });

    expect(result.current.remaining).toBe(0);
    expect(result.current.isRunning).toBe(false);
  });

  it("timer does not continue ticking after skip()", () => {
    const { result } = renderHook(() => useRestTimer());

    act(() => {
      result.current.start(60);
      result.current.skip();
    });
    act(() => { jest.advanceTimersByTime(5000); });

    expect(result.current.remaining).toBe(0);
  });

  // ─── addTime() ────────────────────────────────────────────────────────────

  it("addTime() increases remaining while timer is running", () => {
    const { result } = renderHook(() => useRestTimer());

    act(() => { result.current.start(30); });
    act(() => { result.current.addTime(15); });

    expect(result.current.remaining).toBe(45);
  });

  it("addTime() can extend a nearly-finished timer", () => {
    const { result } = renderHook(() => useRestTimer());

    act(() => { result.current.start(5); });
    act(() => { jest.advanceTimersByTime(4000); }); // 1 second left
    act(() => { result.current.addTime(30); });     // add 30 more

    expect(result.current.remaining).toBe(31);
    expect(result.current.isRunning).toBe(true);
  });

  // ─── saveDuration() ──────────────────────────────────────────────────────

  it("saveDuration() updates duration state and persists to AsyncStorage", async () => {
    const { result } = renderHook(() => useRestTimer());
    await act(async () => {});

    await act(async () => {
      await result.current.saveDuration(120);
    });

    expect(result.current.duration).toBe(120);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      "@gym_tracker_rest_duration",
      "120"
    );
  });

  it("start() uses updated duration after saveDuration()", async () => {
    const { result } = renderHook(() => useRestTimer());
    await act(async () => {});

    await act(async () => {
      await result.current.saveDuration(60);
    });
    act(() => { result.current.start(); });

    expect(result.current.remaining).toBe(60);
  });

  // ─── Restart behaviour ────────────────────────────────────────────────────

  it("calling start() again resets the timer to the new duration", () => {
    const { result } = renderHook(() => useRestTimer());

    act(() => { result.current.start(30); });
    act(() => { jest.advanceTimersByTime(10000); }); // 20 seconds left

    // Restart with a different duration
    act(() => { result.current.start(60); });

    expect(result.current.remaining).toBe(60);
  });

  // ─── Wall-clock accuracy ─────────────────────────────────────────────────

  it("stays accurate when timer callbacks are delayed (app backgrounded)", () => {
    const { result } = renderHook(() => useRestTimer());

    act(() => { result.current.start(90); });
    // Simulate the OS pausing JS for 60s: the clock moves, no ticks run.
    act(() => { jest.setSystemTime(Date.now() + 60_000); });
    act(() => { jest.advanceTimersByTime(250); });

    expect(result.current.remaining).toBe(30);
  });

  it("resumes a running timer after the screen remounts", () => {
    const first = renderHook(() => useRestTimer());
    act(() => { first.result.current.start(60); });
    act(() => { jest.advanceTimersByTime(10_000); });
    first.unmount();

    const second = renderHook(() => useRestTimer());
    expect(second.result.current.remaining).toBe(50);
    expect(second.result.current.total).toBe(60);
    act(() => { jest.advanceTimersByTime(5_000); });
    expect(second.result.current.remaining).toBe(45);
  });

  it("addTime() does nothing when no timer is running", () => {
    const { result } = renderHook(() => useRestTimer());
    act(() => { result.current.addTime(30); });
    expect(result.current.remaining).toBe(0);
    expect(result.current.isRunning).toBe(false);
  });
});
