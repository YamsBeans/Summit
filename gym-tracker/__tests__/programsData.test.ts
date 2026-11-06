import { PROGRAMS } from "@/utils/programsData";
import exercises from "@/assets/data/exercises.json";

const byId = new Map((exercises as any[]).map((e) => [e.id, e]));
const all = PROGRAMS.flatMap((p) => p.routines.flatMap((r) => r.exercises.map((ex) => ({ p, ex }))));

describe("premade programs", () => {
  it("only use exercises that exist in the library", () => {
    expect(all.filter(({ ex }) => !byId.has(ex.exercise_id)).map(({ ex }) => ex.exercise_id)).toEqual([]);
  });

  it("use one exercise id per display name, so history and PRs don't split", () => {
    const idsByName = new Map<string, Set<string>>();
    for (const { ex } of all) {
      const ids = idsByName.get(ex.exercise_name) ?? new Set();
      ids.add(ex.exercise_id);
      idsByName.set(ex.exercise_name, ids);
    }
    const clashes = [...idsByName].filter(([, ids]) => ids.size > 1).map(([name, ids]) => `${name}: ${[...ids].join(", ")}`);
    expect(clashes).toEqual([]);
  });

  it("home programs need no barbell, dumbbell or machine", () => {
    const gear = all.filter(({ p }) => p.equipment === "home")
      .map(({ ex }) => [ex.exercise_id, byId.get(ex.exercise_id)?.equipment])
      .filter(([, eq]) => ["barbell", "dumbbell", "machine", "cable", "kettlebells", "e-z curl bar"].includes(eq));
    expect(gear).toEqual([]);
  });
});
