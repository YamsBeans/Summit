import {
  groupInstances, instanceNumbers, lastTimeForSummary, previousBySessionExercise, previousForInstance,
} from "../utils/previousInstances";

const heavy = [{ session_exercise_id: 10, set_number: 1, weight: 275 }];
const backoff = [{ session_exercise_id: 11, set_number: 1, weight: 185 }];

describe("groupInstances", () => {
  it("orders by exercise order and sorts sets by number", () => {
    const rows = [{ session_exercise_id: 11, exercise_order: 3 }, { session_exercise_id: 10, exercise_order: 1 }];
    const sets = [
      { session_exercise_id: 10, set_number: 2, weight: 280 },
      backoff[0],
      heavy[0],
    ];
    expect(groupInstances(rows, sets).map((i) => i.map((s) => s.weight))).toEqual([[275, 280], [185]]);
  });
});

describe("pairing today's instances with last time's", () => {
  const today = [
    { session_exercise_id: 1, exercise_id: "squat" },
    { session_exercise_id: 2, exercise_id: "bench" },
    { session_exercise_id: 3, exercise_id: "squat" },
  ];

  it("numbers repeats of the same exercise", () => {
    expect([...instanceNumbers(today).entries()]).toEqual([[1, 0], [2, 0], [3, 1]]);
  });

  it("gives the second squat block last time's second block", () => {
    const map = previousBySessionExercise(today, { squat: [heavy, backoff] });
    expect(map["1"]).toBe(heavy);
    expect(map["3"]).toBe(backoff);
    expect(map["2"]).toBeUndefined();
  });

  it("reuses the last block when last time had fewer", () => {
    expect(previousForInstance([heavy], 1)).toBe(heavy);
    expect(previousForInstance([], 0)).toBeUndefined();
    expect(previousForInstance(undefined, 0)).toBeUndefined();
  });
});

describe("lastTimeForSummary", () => {
  it("only compares exercises done once last time", () => {
    const out = lastTimeForSummary({ squat: [heavy, backoff], bench: [heavy], row: [[], backoff] });
    expect(out.squat).toBeUndefined();
    expect(out.bench).toBe(heavy);
    // An instance with nothing completed doesn't make it ambiguous.
    expect(out.row).toBe(backoff);
  });
});
