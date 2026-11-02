// Rows for the Personal Records screen: one per exercise and record type,
// named from the exercise list (or the user's custom exercises).

export type RecordRow = {
  exerciseId: string;
  name: string;
  type: "strength" | "cardio";
  maxWeight: number | null;
  maxVolume: number | null;
  bestDistanceMeters: number | null;
  bestPaceSecPerKm: number | null;
  bestDurationSeconds: number | null;
  achievedAt: string | null;
};

const prettifyId = (id: string) =>
  id.replace(/^custom-/, "").replace(/-\d{10,}$/, "").replace(/[_-]+/g, " ").trim();

export function buildRecordRows(
  prs: any[],
  catalog: { id: string; name: string }[],
  customs: { exercise_id: string; name: string }[],
): RecordRow[] {
  const names = new Map<string, string>();
  for (const e of catalog) names.set(e.id, e.name);
  for (const c of customs) names.set(c.exercise_id, c.name);
  const rows: RecordRow[] = prs
    .filter((p) =>
      p.max_weight || p.max_volume || p.best_distance_meters || p.best_pace_sec_per_km || p.best_duration_seconds)
    .map((p) => ({
      exerciseId: p.exercise_id,
      name: names.get(p.exercise_id) ?? prettifyId(p.exercise_id),
      type: p.pr_type === "cardio" ? "cardio" : "strength",
      maxWeight: p.max_weight ?? null,
      maxVolume: p.max_volume ?? null,
      bestDistanceMeters: p.best_distance_meters ?? null,
      bestPaceSecPerKm: p.best_pace_sec_per_km ?? null,
      bestDurationSeconds: p.best_duration_seconds ?? null,
      achievedAt: p.achieved_at ?? null,
    }));
  // Newest first; records without a date go last, by name.
  return rows.sort((a, b) =>
    (b.achievedAt ?? "").localeCompare(a.achievedAt ?? "") || a.name.localeCompare(b.name));
}
