import { prCountsBySession } from "../utils/sessionPRs";

const sessions = [
  { session_id: 3, session_date: "2026-11-08", start_time: "18:00:00" },
  { session_id: 1, session_date: "2026-11-01", start_time: "18:00:00" },
  { session_id: 2, session_date: "2026-11-04", start_time: "18:00:00" },
];
const ex = (id: number, exercise_id: string, exercise_type = "strength") => ({ session_exercise_id: id, exercise_id, exercise_type });

it("counts exercises that beat every earlier workout, oldest first", () => {
  const counts = prCountsBySession(
    sessions,
    { 1: [ex(10, "bench"), ex(11, "squat")], 2: [ex(20, "bench"), ex(21, "squat")], 3: [ex(30, "bench"), ex(31, "bench"), ex(32, "run", "cardio")] },
    {
      10: [{ weight: 200, completed: true }], 11: [{ weight: 300, completed: true }],
      20: [{ weight: 205, completed: true }], 21: [{ weight: 310, completed: true }, { weight: 400, completed: false }],
      30: [{ weight: 205, completed: true }], 31: [{ weight: 210, completed: true }], 32: [{ weight: 999, completed: true }],
    },
  );
  expect(counts).toEqual({ 1: 0, 2: 2, 3: 1 });
});

it("doesn't count matching a record", () => {
  const counts = prCountsBySession(
    sessions.slice(1),
    { 1: [ex(10, "bench")], 2: [ex(20, "bench")] },
    { 10: [{ weight: 200, completed: true }], 20: [{ weight: 200, completed: null }] },
  );
  expect(counts).toEqual({ 1: 0, 2: 0 });
});
