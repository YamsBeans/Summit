jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {} },
}));

import { warmupPlan, usesBarbell } from "@/utils/warmups";
import { previousSetFor } from "@/utils/setNumbers";

describe("warmupPlan", () => {
  it("ramps from the bar to about 80% in loadable lb steps", () => {
    expect(warmupPlan(225, "lbs", 45)).toEqual([
      { weight: 45, reps: 10 }, { weight: 90, reps: 5 }, { weight: 135, reps: 3 }, { weight: 180, reps: 2 },
    ]);
  });

  it("rounds down to 2.5 kg", () => {
    expect(warmupPlan(100, "kg", 20)).toEqual([
      { weight: 20, reps: 10 }, { weight: 40, reps: 5 }, { weight: 60, reps: 3 }, { weight: 80, reps: 2 },
    ]);
    expect(warmupPlan(62.5, "kg", 20).map((w) => w.weight)).toEqual([20, 25, 37.5, 50]);
  });

  it("drops steps that don't go above the bar or reach the working weight", () => {
    expect(warmupPlan(95, "lbs", 45)).toEqual([{ weight: 45, reps: 10 }, { weight: 55, reps: 3 }, { weight: 75, reps: 2 }]);
    expect(warmupPlan(45, "lbs", 45)).toEqual([]);
    expect(warmupPlan(10, "lbs", 0)).toEqual([{ weight: 5, reps: 3 }]);
  });

  it("skips the bar set for non-barbell lifts", () => {
    expect(warmupPlan(50, "lbs", 0)).toEqual([{ weight: 20, reps: 5 }, { weight: 30, reps: 3 }, { weight: 40, reps: 2 }]);
    expect(warmupPlan(0, "lbs", 45)).toEqual([]);
  });

  it("knows which library lifts use a barbell", () => {
    expect(usesBarbell("Barbell_Squat")).toBe(true);
    expect(usesBarbell("Dumbbell_Bench_Press")).toBe(false);
    expect(usesBarbell("custom-123")).toBe(false);
  });
});

describe("previousSetFor", () => {
  const prev = [
    { is_warmup: true, weight: 45 },
    { is_warmup: false, weight: 185 },
    { is_warmup: false, weight: 190 },
  ];

  it("lines working sets up with last time's working sets when warm-ups changed", () => {
    const today = [{ is_warmup: true }, { is_warmup: true }, { is_warmup: true }, { is_warmup: false }, { is_warmup: false }];
    expect(previousSetFor(prev, today, 0)?.weight).toBe(45);
    expect(previousSetFor(prev, today, 1)).toBeUndefined();
    expect(previousSetFor(prev, today, 3)?.weight).toBe(185);
    expect(previousSetFor(prev, today, 4)?.weight).toBe(190);
  });

  it("matches by position when the layout is the same", () => {
    const today = [{ is_warmup: true }, { is_warmup: false }, { is_warmup: false }, { is_warmup: false }];
    expect(today.map((_, i) => previousSetFor(prev, today, i)?.weight)).toEqual([45, 185, 190, undefined]);
    expect(previousSetFor(undefined, today, 0)).toBeUndefined();
  });
});
