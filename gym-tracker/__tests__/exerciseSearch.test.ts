import { matchesMuscleGroup, pushRecent, searchExercises } from "../utils/exerciseSearch";
import exercises from "../assets/data/exercises.json";

const list = [
  { id: "1", name: "Barbell Bench Press - Medium Grip", primaryMuscles: ["chest"], equipment: "barbell" },
  { id: "2", name: "Incline Dumbbell Press", primaryMuscles: ["chest"], equipment: "dumbbell" },
  { id: "3", name: "Bench Dips", primaryMuscles: ["triceps"], equipment: "body only" },
  { id: "4", name: "Romanian Deadlift", primaryMuscles: ["hamstrings"], equipment: "barbell" },
  { id: "5", name: "Dumbbell Bench Press", primaryMuscles: ["chest"], equipment: "dumbbell" },
];

const names = (r: { name: string }[]) => r.map((e) => e.name);

describe("searchExercises", () => {
  it("matches every word in any order", () => {
    expect(names(searchExercises(list, "press bench")).sort()).toEqual([
      "Barbell Bench Press - Medium Grip",
      "Dumbbell Bench Press",
    ]);
  });

  it("expands gym shorthand", () => {
    expect(names(searchExercises(list, "incline db"))).toEqual(["Incline Dumbbell Press"]);
    expect(names(searchExercises(list, "rdl"))).toEqual(["Romanian Deadlift"]);
  });

  it("ranks names that start with the query first", () => {
    expect(names(searchExercises(list, "bench"))[0]).toBe("Bench Dips");
  });

  it("finds by muscle or equipment too", () => {
    expect(names(searchExercises(list, "triceps"))).toEqual(["Bench Dips"]);
  });

  it("returns nothing for a blank query", () => {
    expect(searchExercises(list, "   ")).toEqual([]);
  });

  it("finds common lifts in the real exercise list", () => {
    const all = exercises as any[];
    expect(searchExercises(all, "bench press").length).toBeGreaterThan(3);
    expect(searchExercises(all, "squat")[0].name.toLowerCase()).toContain("squat");
  });
});

describe("matchesMuscleGroup", () => {
  it("groups specific muscles", () => {
    expect(matchesMuscleGroup(list[3], "legs")).toBe(true);
    expect(matchesMuscleGroup(list[2], "arms")).toBe(true);
    expect(matchesMuscleGroup(list[2], "chest")).toBe(false);
    expect(matchesMuscleGroup(list[2], null)).toBe(true);
  });

  it("matches custom exercises whose muscle is typed in shorthand", () => {
    const custom = { id: "c1", name: "Hack Squat Machine", primaryMuscles: ["Quads"] } as any;
    expect(matchesMuscleGroup(custom, "legs")).toBe(true);
    expect(matchesMuscleGroup({ ...custom, primaryMuscles: ["Bicep"] }, "arms")).toBe(true);
  });
});

describe("pushRecent", () => {
  it("moves the pick to the front without duplicates and caps the list", () => {
    expect(pushRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
    expect(pushRecent(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"]);
  });
});

describe("searchExercises on the real exercise list", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const all = require("../assets/data/exercises.json");
  const top = (q: string, n = 3) => names(searchExercises(all, q)).slice(0, n);

  it("puts the staple lift first for short queries", () => {
    expect(top("bench press", 1)).toEqual(["Barbell Bench Press - Medium Grip"]);
    expect(top("squat", 1)).toEqual(["Barbell Squat"]);
    expect(top("deadlift", 1)).toEqual(["Barbell Deadlift"]);
    expect(top("lat pulldown", 1)).toEqual(["Wide-Grip Lat Pulldown"]);
  });

  it("matches the start of words, so run finds running and not crunches", () => {
    const hits = names(searchExercises(all, "run"));
    expect(hits).toContain("Running, Treadmill");
    expect(hits.some((n) => /crunch/i.test(n))).toBe(false);
  });

  it("falls back to substrings when no word starts with the query", () => {
    expect(names(searchExercises(all, "ullup")).length).toBeGreaterThan(0);
  });

  it("every staple id exists", () => {
    const { STAPLE_EXERCISE_IDS } = require("@/utils/exerciseSearch");
    const ids = new Set(all.map((e: any) => e.id));
    expect([...STAPLE_EXERCISE_IDS].filter((id: string) => !ids.has(id))).toEqual([]);
  });
});

import { popularExercises } from "../utils/exerciseSearch";

describe("popularExercises", () => {
  it("lists staple lifts in order, skipping ones already shown", () => {
    const pool = [
      { id: "3/4_Sit-Up" }, { id: "Barbell_Squat" }, { id: "Pullups" }, { id: "Barbell_Bench_Press_-_Medium_Grip" },
    ];
    expect(popularExercises(pool).map((e) => e.id)).toEqual(["Barbell_Bench_Press_-_Medium_Grip", "Barbell_Squat", "Pullups"]);
    expect(popularExercises(pool, ["Barbell_Squat"], 1).map((e) => e.id)).toEqual(["Barbell_Bench_Press_-_Medium_Grip"]);
  });
});
