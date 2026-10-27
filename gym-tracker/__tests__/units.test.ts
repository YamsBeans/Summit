import { renderHook, act } from "@testing-library/react-native";
import { useUnits } from "../utils/units";

// Mock AsyncStorage so tests never touch the filesystem / native layer
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));

const AsyncStorage = require("@react-native-async-storage/async-storage");
const KG_FACTOR = 0.453592;

describe("useUnits", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AsyncStorage.getItem.mockResolvedValue(null); // default: no saved preference
  });

  // ─── Default state ────────────────────────────────────────────────────────

  it("defaults to lbs when no preference is stored", async () => {
    const { result } = renderHook(() => useUnits());
    await act(async () => {}); // flush the AsyncStorage.getItem effect
    expect(result.current.unit).toBe("lbs");
    expect(result.current.label).toBe("lbs");
  });

  it("restores saved kg preference from AsyncStorage on mount", async () => {
    AsyncStorage.getItem.mockResolvedValue("kg");
    const { result } = renderHook(() => useUnits());
    await act(async () => {});
    expect(result.current.unit).toBe("kg");
  });

  // ─── toDisplay (lbs mode) ─────────────────────────────────────────────────

  it("toDisplay returns the value unchanged in lbs mode", async () => {
    const { result } = renderHook(() => useUnits());
    await act(async () => {});
    expect(result.current.toDisplay(100)).toBe(100);
    expect(result.current.toDisplay(0)).toBe(0);
    expect(result.current.toDisplay(225)).toBe(225);
  });

  it("toDisplay returns null for null input in lbs mode", async () => {
    const { result } = renderHook(() => useUnits());
    await act(async () => {});
    expect(result.current.toDisplay(null)).toBeNull();
    expect(result.current.toDisplay(undefined)).toBeNull();
  });

  // ─── toDisplay (kg mode) ─────────────────────────────────────────────────

  it("toDisplay converts lbs to kg rounded to 1 decimal place", async () => {
    AsyncStorage.getItem.mockResolvedValue("kg");
    const { result } = renderHook(() => useUnits());
    await act(async () => {});

    // 100 lbs × 0.453592 = 45.3592 → rounds to 45.4
    expect(result.current.toDisplay(100)).toBe(45.4);

    // 45 lbs × 0.453592 = 20.41164 → rounds to 20.4
    expect(result.current.toDisplay(45)).toBe(20.4);

    // 225 lbs × 0.453592 = 102.05 → rounds to 102.1
    expect(result.current.toDisplay(225)).toBeCloseTo(102.1, 0);
  });

  it("toDisplay returns null for null input in kg mode", async () => {
    AsyncStorage.getItem.mockResolvedValue("kg");
    const { result } = renderHook(() => useUnits());
    await act(async () => {});
    expect(result.current.toDisplay(null)).toBeNull();
  });

  // ─── toStorage (lbs mode) ─────────────────────────────────────────────────

  it("toStorage returns the value unchanged in lbs mode", async () => {
    const { result } = renderHook(() => useUnits());
    await act(async () => {});
    expect(result.current.toStorage(100)).toBe(100);
  });

  it("toStorage returns null for null input in lbs mode", async () => {
    const { result } = renderHook(() => useUnits());
    await act(async () => {});
    expect(result.current.toStorage(null)).toBeNull();
  });

  // ─── toStorage (kg mode) ─────────────────────────────────────────────────

  it("toStorage converts kg back to lbs rounded to 1 decimal place", async () => {
    AsyncStorage.getItem.mockResolvedValue("kg");
    const { result } = renderHook(() => useUnits());
    await act(async () => {});

    // 45.4 kg / 0.453592 ≈ 100.09 → rounds to 100.1
    expect(result.current.toStorage(45.4)).toBeCloseTo(100.1, 0);

    // 20 kg / 0.453592 ≈ 44.09 → rounds to 44.1
    expect(result.current.toStorage(20)).toBeCloseTo(44.1, 0);
  });

  // ─── Round-trip fidelity ───────────────────────────────────────────────────

  it("toDisplay → toStorage round-trip is approximately lossless", async () => {
    AsyncStorage.getItem.mockResolvedValue("kg");
    const { result } = renderHook(() => useUnits());
    await act(async () => {});

    const original = 135; // lbs stored
    const displayed = result.current.toDisplay(original)!;
    const restored = result.current.toStorage(displayed)!;
    // Allow ±0.5 lbs tolerance due to rounding at both steps
    expect(Math.abs(restored - original)).toBeLessThan(0.5);
  });

  // ─── saveUnit ─────────────────────────────────────────────────────────────

  it("saveUnit updates unit state and persists to AsyncStorage", async () => {
    const { result } = renderHook(() => useUnits());
    await act(async () => {});
    expect(result.current.unit).toBe("lbs");

    await act(async () => {
      await result.current.saveUnit("kg");
    });

    expect(result.current.unit).toBe("kg");
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      "@gym_tracker_units",
      "kg"
    );
  });

  it("saveUnit can switch back from kg to lbs", async () => {
    AsyncStorage.getItem.mockResolvedValue("kg");
    const { result } = renderHook(() => useUnits());
    await act(async () => {});
    expect(result.current.unit).toBe("kg");

    await act(async () => {
      await result.current.saveUnit("lbs");
    });

    expect(result.current.unit).toBe("lbs");
    expect(result.current.toDisplay(100)).toBe(100);
  });
});
