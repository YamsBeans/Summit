import { matchRoutineExercises } from "@/utils/routineMatch";

describe("matchRoutineExercises", () => {
  it("pairs repeated exercises by occurrence, not last-wins", () => {
    const routine = [
      { routine_exercise_id: 10, exercise_id: "squat", exercise_order: 1 },
      { routine_exercise_id: 11, exercise_id: "bench", exercise_order: 2 },
      { routine_exercise_id: 12, exercise_id: "squat", exercise_order: 4 },
    ];
    const session = [
      { session_exercise_id: 3, exercise_id: "squat", exercise_order: 3 },
      { session_exercise_id: 1, exercise_id: "squat", exercise_order: 1 },
      { session_exercise_id: 2, exercise_id: "bench", exercise_order: 2 },
    ];
    const pairs = matchRoutineExercises(session, routine).map(([s, r]) => [s.session_exercise_id, r.routine_exercise_id]);
    expect(pairs).toEqual([[1, 10], [2, 11], [3, 12]]);
  });

  it("skips exercises not in the routine and extra instances", () => {
    const routine = [{ routine_exercise_id: 10, exercise_id: "squat", exercise_order: 1 }];
    const session = [
      { session_exercise_id: 1, exercise_id: "squat", exercise_order: 1 },
      { session_exercise_id: 2, exercise_id: "curl", exercise_order: 2 },
      { session_exercise_id: 3, exercise_id: "squat", exercise_order: 3 },
    ];
    expect(matchRoutineExercises(session, routine).map(([s]) => s.session_exercise_id)).toEqual([1]);
  });
});

describe("matchRoutineExercises with a deleted instance", () => {
  const routine = [
    { routine_exercise_id: 10, exercise_id: "squat", exercise_order: 1 },
    { routine_exercise_id: 11, exercise_id: "bench", exercise_order: 2 },
    { routine_exercise_id: 12, exercise_id: "squat", exercise_order: 4 },
  ];

  it("keeps back-off squats on the back-off template when the heavy squats were deleted", () => {
    const session = [
      { session_exercise_id: 2, exercise_id: "bench", exercise_order: 2 },
      { session_exercise_id: 3, exercise_id: "squat", exercise_order: 4 },
    ];
    const pairs = matchRoutineExercises(session, routine).map(([s, r]) => [s.session_exercise_id, r.routine_exercise_id]);
    expect(pairs).toEqual([[2, 11], [3, 12]]);
  });

  it("falls back to occurrence order for exercises moved during the workout", () => {
    const session = [
      { session_exercise_id: 1, exercise_id: "squat", exercise_order: 2 },
      { session_exercise_id: 2, exercise_id: "bench", exercise_order: 1 },
      { session_exercise_id: 3, exercise_id: "squat", exercise_order: 4 },
    ];
    const pairs = matchRoutineExercises(session, routine).map(([s, r]) => [s.session_exercise_id, r.routine_exercise_id]);
    expect(pairs).toEqual([[2, 11], [1, 10], [3, 12]]);
  });
});

describe("matchRoutineExercises after a reorder renumbers the session", () => {
  it("doesn't swap the heavy and back-off templates", () => {
    const routine = [
      { routine_exercise_id: 10, exercise_id: "squat", exercise_order: 1 },
      { routine_exercise_id: 11, exercise_id: "squat", exercise_order: 2 },
      { routine_exercise_id: 12, exercise_id: "bench", exercise_order: 3 },
    ];
    const session = [
      { session_exercise_id: 3, exercise_id: "bench", exercise_order: 1 },
      { session_exercise_id: 1, exercise_id: "squat", exercise_order: 2 },
      { session_exercise_id: 2, exercise_id: "squat", exercise_order: 3 },
    ];
    const pairs = matchRoutineExercises(session, routine).map(([s, r]) => [s.session_exercise_id, r.routine_exercise_id]);
    expect(pairs).toEqual([[3, 12], [1, 10], [2, 11]]);
  });
});

import { matchRoutineSets } from "@/utils/routineMatch";

describe("matchRoutineSets", () => {
  const routine = [
    { routine_set_id: 101, set_number: 1, is_warmup: false },
    { routine_set_id: 102, set_number: 2, is_warmup: false },
    { routine_set_id: 103, set_number: 3, is_warmup: false },
  ];

  it("skips warm-ups the routine doesn't have and lines working sets up", () => {
    const session = [
      { id: "w1", set_number: 1, is_warmup: true, completed: true },
      { id: "w2", set_number: 2, is_warmup: true, completed: true },
      { id: "a", set_number: 3, is_warmup: false, completed: true },
      { id: "b", set_number: 4, is_warmup: false, completed: true },
      { id: "c", set_number: 5, is_warmup: false, completed: false },
    ];
    expect(matchRoutineSets(session, routine).map(([s, r]) => [s.id, r.routine_set_id])).toEqual([["a", 101], ["b", 102]]);
  });

  it("pairs warm-ups with the routine's warm-ups", () => {
    const withWarm = [{ routine_set_id: 100, set_number: 1, is_warmup: true }, ...routine.map((r) => ({ ...r, set_number: r.set_number + 1 }))];
    const session = [
      { id: "w", set_number: 1, is_warmup: true, completed: true },
      { id: "a", set_number: 2, is_warmup: false, completed: true },
    ];
    expect(matchRoutineSets(session, withWarm).map(([s, r]) => [s.id, r.routine_set_id])).toEqual([["w", 100], ["a", 101]]);
  });
});
