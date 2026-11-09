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
