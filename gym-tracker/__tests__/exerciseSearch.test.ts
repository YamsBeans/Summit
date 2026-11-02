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
    expect(names(searchExercises(list, "press bench"))).toEqual([
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
});

describe("pushRecent", () => {
  it("moves the pick to the front without duplicates and caps the list", () => {
    expect(pushRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
    expect(pushRecent(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"]);
  });
});
