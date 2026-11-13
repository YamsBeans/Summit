import { muscleGroupFor, muscleSplit } from "@/utils/muscleSplit";

describe("muscleGroupFor", () => {
  it("maps library muscles and custom free text", () => {
    expect(muscleGroupFor(["lats"])).toBe("back");
    expect(muscleGroupFor(["Quadriceps"])).toBe("legs");
    expect(muscleGroupFor(["Chest"])).toBe("chest");
    expect(muscleGroupFor(["arms"])).toBe("arms");
    expect(muscleGroupFor(["toes"])).toBeNull();
    expect(muscleGroupFor([])).toBeNull();
  });

  it("understands gym shorthand typed for custom exercises", () => {
    expect(muscleGroupFor(["Quads"])).toBe("legs");
    expect(muscleGroupFor(["glute"])).toBe("legs");
    expect(muscleGroupFor(["Calf"])).toBe("legs");
    expect(muscleGroupFor(["Hamstring"])).toBe("legs");
    expect(muscleGroupFor(["Abs"])).toBe("core");
    expect(muscleGroupFor(["Delts"])).toBe("shoulders");
    expect(muscleGroupFor(["Bicep"])).toBe("arms");
    expect(muscleGroupFor(["tricep"])).toBe("arms");
    expect(muscleGroupFor(["Pecs"])).toBe("chest");
    expect(muscleGroupFor(["Upper Back"])).toBe("back");
    expect(muscleGroupFor(["Back"])).toBe("back");
  });
});

describe("muscleSplit", () => {
  const muscles: Record<string, string[]> = { bench: ["chest"], squat: ["quadriceps"], run: ["quadriceps"], stretch: ["hamstrings"] };
  const done = { completed: true };
  it("counts working sets in range per group", () => {
    const rows = muscleSplit([
      { date: "2026-11-05", exerciseId: "bench", sets: [done, done, { completed: true, is_warmup: true }, { completed: false }] },
      { date: "2026-11-01", exerciseId: "bench", sets: [{ completed: null }] },
      { date: "2026-10-01", exerciseId: "squat", sets: [done] }, // too old
      { date: "2026-11-05", exerciseId: "run", exerciseType: "cardio", sets: [done] },
      { date: "2026-11-05", exerciseId: "stretch", exerciseType: "stretching", sets: [done] },
      { date: "2026-11-05", exerciseId: "mystery", sets: [done] },
    ], (id) => muscles[id], "2026-10-07");
    expect(rows.map((r) => r.key)).toEqual(["chest", "back", "shoulders", "arms", "legs", "core"]);
    expect(rows.find((r) => r.key === "chest")!.sets).toBe(3);
    expect(rows.find((r) => r.key === "legs")!.sets).toBe(0);
  });
});
