import { formatNumberInput, parseDecimalInput, parseIntInput } from "../utils/numberInput";

describe("parseDecimalInput", () => {
  it("parses plain numbers", () => {
    expect(parseDecimalInput("135")).toBe(135);
    expect(parseDecimalInput("82.5")).toBe(82.5);
  });
  it("accepts a comma decimal separator", () => {
    expect(parseDecimalInput("82,5")).toBe(82.5);
  });
  it("returns null for empty or junk input instead of NaN", () => {
    expect(parseDecimalInput("")).toBeNull();
    expect(parseDecimalInput("   ")).toBeNull();
    expect(parseDecimalInput(".")).toBeNull();
    expect(parseDecimalInput("abc")).toBeNull();
    expect(parseDecimalInput(null)).toBeNull();
  });
  it("rejects negatives", () => {
    expect(parseDecimalInput("-5")).toBeNull();
  });
});

describe("parseIntInput", () => {
  it("rounds to whole reps", () => {
    expect(parseIntInput("8")).toBe(8);
    expect(parseIntInput("7.6")).toBe(8);
  });
  it("returns null for invalid input", () => {
    expect(parseIntInput("x")).toBeNull();
  });
});

describe("formatNumberInput", () => {
  it("formats numbers and blanks null", () => {
    expect(formatNumberInput(100)).toBe("100");
    expect(formatNumberInput(102.5)).toBe("102.5");
    expect(formatNumberInput(null)).toBe("");
    expect(formatNumberInput(undefined)).toBe("");
  });
});
