import {
  buildExerciseIdMap,
  remapSetsForInsert,
  InsertedExercise,
} from "../backend/syncMapping";
import type { PendingSession } from "../backend/offlineQueue";

type QueuedExercise = PendingSession["exercises"][number];
type QueuedSet = PendingSession["sets"][number];

function makeExercise(localId: number, order = 1): QueuedExercise {
  return {
    session_exercise_id: localId,
    exercise_id: "bench-press",
    exercise_name: "Bench Press",
    exercise_order: order,
    notes: null,
    exercise_type: "strength",
  };
}

function makeSet(localExerciseId: number, setNumber: number, over: Partial<QueuedSet> = {}): QueuedSet {
  return {
    session_exercise_id: localExerciseId,
    set_number: setNumber,
    weight: 100,
    reps: 10,
    is_warmup: false,
    completed: true,
    duration_seconds: null,
    distance_meters: null,
    pace_sec_per_km: null,
    calories: null,
    effort_level: null,
    ...over,
  };
}

// ─── buildExerciseIdMap ────────────────────────────────────────────────────────

describe("buildExerciseIdMap", () => {
  it("returns an empty map for empty inputs", () => {
    expect(buildExerciseIdMap([], [])).toEqual({});
  });

  it("maps local temp IDs to remote IDs by insertion order", () => {
    const local = [makeExercise(101, 1), makeExercise(102, 2)];
    const inserted: InsertedExercise[] = [
      { session_exercise_id: 5001 },
      { session_exercise_id: 5002 },
    ];
    expect(buildExerciseIdMap(local, inserted)).toEqual({ 101: 5001, 102: 5002 });
  });

  it("only maps as many rows as were inserted", () => {
    const local = [makeExercise(101), makeExercise(102), makeExercise(103)];
    const inserted: InsertedExercise[] = [{ session_exercise_id: 5001 }];
    // Only the first local exercise gets a remote ID.
    expect(buildExerciseIdMap(local, inserted)).toEqual({ 101: 5001 });
  });

  it("ignores extra inserted rows with no matching local exercise", () => {
    const local = [makeExercise(101)];
    const inserted: InsertedExercise[] = [
      { session_exercise_id: 5001 },
      { session_exercise_id: 5002 },
    ];
    expect(buildExerciseIdMap(local, inserted)).toEqual({ 101: 5001 });
  });
});

// ─── remapSetsForInsert ────────────────────────────────────────────────────────

describe("remapSetsForInsert", () => {
  it("returns an empty array for no sets", () => {
    expect(remapSetsForInsert([], { 101: 5001 })).toEqual([]);
  });

  it("remaps each set's exercise id to the remote id", () => {
    const sets = [makeSet(101, 1), makeSet(101, 2)];
    const result = remapSetsForInsert(sets, { 101: 5001 });
    expect(result.map((s) => s.session_exercise_id)).toEqual([5001, 5001]);
    expect(result.map((s) => s.set_number)).toEqual([1, 2]);
  });

  it("drops sets whose exercise is not in the map", () => {
    const sets = [makeSet(101, 1), makeSet(999, 1)]; // 999 failed to insert
    const result = remapSetsForInsert(sets, { 101: 5001 });
    expect(result).toHaveLength(1);
    expect(result[0].session_exercise_id).toBe(5001);
  });

  it("preserves all strength and cardio fields", () => {
    const sets = [
      makeSet(101, 1, {
        weight: null,
        reps: null,
        is_warmup: true,
        completed: false,
        duration_seconds: 1500,
        distance_meters: 5000,
        pace_sec_per_km: 300,
        calories: 420,
        effort_level: 8,
      }),
    ];
    const [s] = remapSetsForInsert(sets, { 101: 5001 });
    expect(s).toEqual({
      session_exercise_id: 5001,
      set_number: 1,
      weight: null,
      reps: null,
      is_warmup: true,
      completed: false,
      duration_seconds: 1500,
      distance_meters: 5000,
      pace_sec_per_km: 300,
      calories: 420,
      effort_level: 8,
    });
  });

  it("maps sets across multiple exercises", () => {
    const sets = [makeSet(101, 1), makeSet(102, 1), makeSet(102, 2)];
    const result = remapSetsForInsert(sets, { 101: 5001, 102: 5002 });
    expect(result.map((s) => s.session_exercise_id)).toEqual([5001, 5002, 5002]);
  });
});
