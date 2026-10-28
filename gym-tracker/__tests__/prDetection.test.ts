import { detectPRs, PRResult } from "../utils/prDetection";

// Helper to build exercise entries
function makeExercise(id: number, exerciseId: string, name: string) {
  return { session_exercise_id: id, exercise_id: exerciseId, exercise_name: name };
}

// Helper to build a completed set
function makeSet(weight: number | null, reps: number | null, completed = true) {
  return { weight, reps, completed };
}

describe("detectPRs", () => {
  // ─── No-PR cases ──────────────────────────────────────────────────────────

  it("returns empty array when there are no exercises", () => {
    const result = detectPRs([], {}, []);
    expect(result).toEqual([]);
  });

  it("returns empty array when no sets are completed", () => {
    const exercises = [makeExercise(1, "bench-press", "Bench Press")];
    const sets = { 1: [makeSet(100, 10, false), makeSet(110, 8, false)] };
    const result = detectPRs(exercises, sets, []);
    expect(result).toEqual([]);
  });

  it("returns empty array when sets exist but weight and reps are null", () => {
    const exercises = [makeExercise(1, "bench-press", "Bench Press")];
    const sets = { 1: [makeSet(null, null)] };
    const result = detectPRs(exercises, sets, []);
    // weight=0 > prevWeight=0 is false; volume=0 > prevVolume=0 is false
    expect(result).toEqual([]);
  });

  it("returns empty array when new weight does not beat the previous PR", () => {
    const exercises = [makeExercise(1, "bench-press", "Bench Press")];
    const sets = { 1: [makeSet(100, 5)] };
    const prev = [{ exercise_id: "bench-press", max_weight: 120, max_volume: 600 }];
    const result = detectPRs(exercises, sets, prev);
    expect(result).toEqual([]);
  });

  // ─── Weight PR ────────────────────────────────────────────────────────────

  it("detects a weight PR when no previous record exists", () => {
    const exercises = [makeExercise(1, "squat", "Squat")];
    const sets = { 1: [makeSet(135, 5)] };
    const result = detectPRs(exercises, sets, []);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject<PRResult>({
      exerciseId: "squat",
      exerciseName: "Squat",
      type: "both", // first time: 135 > 0 (weight) AND 675 > 0 (volume)
      newMax: 135,
    });
  });

  it("detects a weight-only PR when new max weight exceeds prior but volume does not", () => {
    const exercises = [makeExercise(1, "deadlift", "Deadlift")];
    // 1 set of 200×1 = volume 200; prior record: weight 180, volume 1000
    const sets = { 1: [makeSet(200, 1)] };
    const prev = [{ exercise_id: "deadlift", max_weight: 180, max_volume: 1000 }];
    const result = detectPRs(exercises, sets, prev);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("weight");
    expect(result[0].newMax).toBe(200);
  });

  // ─── Volume PR ────────────────────────────────────────────────────────────

  it("detects a volume-only PR when total volume exceeds prior but weight does not", () => {
    const exercises = [makeExercise(1, "curl", "Bicep Curl")];
    // 5 sets of 50×10 = volume 2500; prior: weight 60, volume 2000
    const sets = {
      1: [
        makeSet(50, 10),
        makeSet(50, 10),
        makeSet(50, 10),
        makeSet(50, 10),
        makeSet(50, 10),
      ],
    };
    const prev = [{ exercise_id: "curl", max_weight: 60, max_volume: 2000 }];
    const result = detectPRs(exercises, sets, prev);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("volume");
    expect(result[0].newMax).toBe(2500);
  });

  // ─── Both PRs ─────────────────────────────────────────────────────────────

  it("detects 'both' when weight and volume both exceed prior records", () => {
    const exercises = [makeExercise(1, "ohp", "Overhead Press")];
    const sets = { 1: [makeSet(100, 10), makeSet(105, 8)] }; // maxWeight=105, vol=1840
    const prev = [{ exercise_id: "ohp", max_weight: 95, max_volume: 1000 }];
    const result = detectPRs(exercises, sets, prev);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("both");
  });

  // ─── Multiple exercises ───────────────────────────────────────────────────

  it("handles multiple exercises independently", () => {
    const exercises = [
      makeExercise(1, "bench-press", "Bench Press"),
      makeExercise(2, "squat", "Squat"),
      makeExercise(3, "deadlift", "Deadlift"),
    ];
    const sets = {
      1: [makeSet(150, 5)],  // weight=150 > 140, volume=750 > 700 → PR
      2: [makeSet(200, 5)],  // weight=200 = 200, volume=1000 = 1000 → no PR (tied)
      3: [makeSet(180, 3)],  // weight=180 > 170, volume=540 > 100 → PR
    };
    const prev = [
      { exercise_id: "bench-press", max_weight: 140, max_volume: 700 },
      { exercise_id: "squat",       max_weight: 200, max_volume: 1000 },
      { exercise_id: "deadlift",    max_weight: 170, max_volume: 100 },
    ];
    const result = detectPRs(exercises, sets, prev);
    const ids = result.map((r) => r.exerciseId);
    expect(ids).toContain("bench-press");
    expect(ids).toContain("deadlift");
    expect(ids).not.toContain("squat"); // tied, not beaten
    expect(result).toHaveLength(2);
  });

  // ─── Edge cases ───────────────────────────────────────────────────────────

  it("ignores incomplete sets when calculating PRs", () => {
    const exercises = [makeExercise(1, "row", "Barbell Row")];
    // Only the first set is completed; the heavy uncompleted set should not count
    const sets = { 1: [makeSet(100, 5, true), makeSet(300, 1, false)] };
    // prev weight=150 (> 100) and prev volume=600 (> 100×5=500) — no PR should fire
    const prev = [{ exercise_id: "row", max_weight: 150, max_volume: 600 }];
    const result = detectPRs(exercises, sets, prev);
    // maxWeight from completed sets = 100, which does not beat 150
    // volume from completed sets = 500, which does not beat 600
    expect(result).toEqual([]);
  });

  it("uses the heaviest completed set as the max weight", () => {
    const exercises = [makeExercise(1, "press", "Press")];
    const sets = { 1: [makeSet(80, 5), makeSet(90, 3), makeSet(95, 1)] };
    const prev = [{ exercise_id: "press", max_weight: 90, max_volume: 0 }];
    const result = detectPRs(exercises, sets, prev);
    // maxWeight = 95 > 90 → weight PR
    expect(result).toHaveLength(1);
    expect(result[0].newMax).toBe(95);
  });

  it("treats missing exercise entry in sets map as zero completed sets", () => {
    const exercises = [makeExercise(99, "lunge", "Lunge")];
    // No entry for session_exercise_id 99 in the sets map
    const result = detectPRs(exercises, {}, []);
    expect(result).toEqual([]);
  });
});

import { mergeStrengthRecord } from "../utils/prDetection";

describe("mergeStrengthRecord", () => {
  it("keeps the all-time heaviest weight on a volume-only PR", () => {
    const sets = [makeSet(185, 10), makeSet(185, 10), makeSet(185, 10)];
    expect(mergeStrengthRecord(sets, { max_weight: 225, max_volume: 4000 })).toEqual({
      max_weight: 225,
      max_volume: 5550,
    });
  });

  it("keeps the best volume on a weight-only PR", () => {
    const sets = [makeSet(250, 1)];
    expect(mergeStrengthRecord(sets, { max_weight: 225, max_volume: 4000 })).toEqual({
      max_weight: 250,
      max_volume: 4000,
    });
  });

  it("uses this session when there is no previous record", () => {
    expect(mergeStrengthRecord([makeSet(100, 5), makeSet(100, 5, false)], null)).toEqual({
      max_weight: 100,
      max_volume: 500,
    });
  });
});

describe("detectPRs with cardio records", () => {
  it("ignores cardio records for the same exercise id", () => {
    const exercises = [makeExercise(1, "x", "X")];
    const sets = { 1: [makeSet(100, 5)] };
    const prs = detectPRs(exercises, sets, [
      { exercise_id: "x", max_weight: 500, max_volume: 9999, pr_type: "strength" },
      { exercise_id: "x", max_weight: null, max_volume: null, pr_type: "cardio" },
    ]);
    expect(prs).toEqual([]);
  });
});
