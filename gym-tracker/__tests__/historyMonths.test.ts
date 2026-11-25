import { historyMonthHeaders } from "../utils/historyMonths";

const now = new Date(2026, 10, 25);

it("puts one header on the first workout of each month, with the month's count", () => {
  const h = historyMonthHeaders([
    { session_date: "2026-11-24" },
    { session_date: "2026-11-02" },
    { session_date: "2026-10-30" },
    { session_date: "2025-12-31" },
  ], now);
  expect(h).toEqual([
    { label: "November", count: 2 },
    undefined,
    { label: "October", count: 1 },
    { label: "December 2025", count: 1 },
  ]);
});

it("reads the stored date, so a late-evening workout isn't moved to the next month", () => {
  expect(historyMonthHeaders([{ session_date: "2026-10-31" }], now)[0]?.label).toBe("October");
});

it("copes with an empty list and odd dates", () => {
  expect(historyMonthHeaders([], now)).toEqual([]);
  expect(historyMonthHeaders([{ session_date: "" }], now)[0]?.label).toBe("Earlier");
});
