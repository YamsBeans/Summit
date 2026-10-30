jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));

import { formatRest, parseRestMap, resolveRest } from "@/utils/exerciseRest";

describe("exercise rest overrides", () => {
  it("parses stored JSON defensively", () => {
    expect(parseRestMap(null)).toEqual({});
    expect(parseRestMap("not json")).toEqual({});
    expect(parseRestMap("[1,2]")).toEqual({});
    expect(parseRestMap(JSON.stringify({ a: 120, b: 0, c: -5, d: "90", e: 99999, f: 90.4 }))).toEqual({ a: 120, b: 0, f: 90 });
  });

  it("falls back to the default unless an override exists (0 = off)", () => {
    const map = { squat: 180, curl: 0 };
    expect(resolveRest(map, "squat", 90)).toBe(180);
    expect(resolveRest(map, "curl", 90)).toBe(0);
    expect(resolveRest(map, "bench", 90)).toBe(90);
    expect(resolveRest(map, undefined, 90)).toBe(90);
    expect(resolveRest(map, "toString", 90)).toBe(90);
  });

  it("formats durations", () => {
    expect(formatRest(0)).toBe("Off");
    expect(formatRest(45)).toBe("0:45");
    expect(formatRest(90)).toBe("1:30");
    expect(formatRest(300)).toBe("5:00");
  });
});
