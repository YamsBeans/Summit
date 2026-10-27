import { renderHook, act } from "@testing-library/react-native";
import { useGuardedPress } from "../utils/pressGuard";

describe("useGuardedPress", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─── Basic invocation ─────────────────────────────────────────────────────

  it("calls the wrapped function on first press", async () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useGuardedPress(fn));

    await act(async () => {
      await result.current();
    });

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("passes arguments through to the wrapped function", async () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useGuardedPress(fn));

    await act(async () => {
      await result.current("hello", 42);
    });

    expect(fn).toHaveBeenCalledWith("hello", 42);
  });

  // ─── Double-tap prevention ────────────────────────────────────────────────

  it("ignores a second press that occurs before the delay expires", async () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useGuardedPress(fn, 400));

    await act(async () => {
      await result.current(); // first press — goes through
      await result.current(); // immediate second press — should be blocked
    });

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("allows a second press after the delay has expired", async () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useGuardedPress(fn, 400));

    // First press
    await act(async () => {
      await result.current();
    });

    // Advance past the guard delay
    act(() => {
      jest.advanceTimersByTime(400);
    });

    // Second press — now allowed
    await act(async () => {
      await result.current();
    });

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does NOT allow a second press before the delay expires", async () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useGuardedPress(fn, 400));

    await act(async () => {
      await result.current();
    });

    // Advance only partway through the delay
    act(() => {
      jest.advanceTimersByTime(200);
    });

    await act(async () => {
      await result.current(); // still blocked
    });

    expect(fn).toHaveBeenCalledTimes(1);
  });

  // ─── Custom delay ─────────────────────────────────────────────────────────

  it("respects a custom delayMs value", async () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useGuardedPress(fn, 1000));

    await act(async () => {
      await result.current();
    });

    // Advance 999ms — still blocked
    act(() => jest.advanceTimersByTime(999));
    await act(async () => { await result.current(); });
    expect(fn).toHaveBeenCalledTimes(1);

    // Advance the final 1ms — now unblocked
    act(() => jest.advanceTimersByTime(1));
    await act(async () => { await result.current(); });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // ─── Async function support ───────────────────────────────────────────────

  it("works correctly when the wrapped function is async", async () => {
    const asyncFn = jest.fn(() => Promise.resolve());
    const { result } = renderHook(() => useGuardedPress(asyncFn, 400));

    // First press — goes through
    await act(async () => { await result.current(); });
    expect(asyncFn).toHaveBeenCalledTimes(1);

    // Second press immediately after — still in guard window, blocked
    await act(async () => { await result.current(); });
    expect(asyncFn).toHaveBeenCalledTimes(1);

    // Advance past the delay, then a third press — should be allowed
    act(() => jest.advanceTimersByTime(400));
    await act(async () => { await result.current(); });
    expect(asyncFn).toHaveBeenCalledTimes(2);
  });
});
