import { findNextSet } from "@/utils/nextSet";

const exs = [{ session_exercise_id: 1 }, { session_exercise_id: 2 }, { session_exercise_id: 3 }];

describe("findNextSet", () => {
  it("stays on the current exercise while it has sets left", () => {
    const sets = { 1: [{ completed: true }, { completed: false }], 2: [{ completed: false }] };
    expect(findNextSet(exs, sets, 1)).toMatchObject({ exercise: { session_exercise_id: 1 }, index: 1 });
  });
  it("moves to the next exercise, then wraps to skipped earlier sets", () => {
    const sets = { 1: [{ completed: false }], 2: [{ completed: true }], 3: [{ completed: true }] };
    expect(findNextSet(exs, sets, 2)).toMatchObject({ exercise: { session_exercise_id: 1 }, index: 0 });
    const sets2 = { 1: [{ completed: false }], 2: [{ completed: true }], 3: [{ completed: false }] };
    expect(findNextSet(exs, sets2, 2)).toMatchObject({ exercise: { session_exercise_id: 3 }, index: 0 });
  });
  it("returns null when everything is done", () => {
    expect(findNextSet(exs, { 1: [{ completed: true }] }, 1)).toBeNull();
  });
  it("starts at the top when the exercise is unknown", () => {
    expect(findNextSet(exs, { 2: [{ completed: false }] }, 99)).toMatchObject({ exercise: { session_exercise_id: 2 } });
  });
});
