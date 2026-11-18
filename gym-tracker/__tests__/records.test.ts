import { buildRecordRows } from "../utils/records";

it("names records, drops empty ones and sorts newest first", () => {
  const rows = buildRecordRows(
    [
      { exercise_id: "Barbell_Squat", pr_type: "strength", max_weight: 225, max_volume: 1125, achieved_at: "2026-10-01T10:00:00Z" },
      { exercise_id: "custom-my-row-1730000000000", pr_type: "strength", max_weight: 135, max_volume: null, achieved_at: "2026-11-01T10:00:00Z" },
      { exercise_id: "Running", pr_type: "cardio", best_distance_meters: 5000, best_pace_sec_per_km: 300, achieved_at: null },
      { exercise_id: "Empty", pr_type: "strength", max_weight: null, max_volume: null },
    ],
    [{ id: "Barbell_Squat", name: "Barbell Squat" }],
    [],
  );
  expect(rows.map((r) => [r.name, r.type])).toEqual([
    ["my row", "strength"],
    ["Barbell Squat", "strength"],
    ["Running", "cardio"],
  ]);
});

it("uses custom exercise names", () => {
  const rows = buildRecordRows(
    [{ exercise_id: "custom-x-1", pr_type: "strength", max_weight: 10 }],
    [],
    [{ exercise_id: "custom-x-1", name: "Landmine Press" }],
  );
  expect(rows[0].name).toBe("Landmine Press");
});
