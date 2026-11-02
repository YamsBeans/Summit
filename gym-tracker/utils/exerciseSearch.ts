// Exercise picker search and filtering, kept free of React so it's testable.

export type SearchableExercise = {
  id: string;
  name: string;
  primaryMuscles?: string[];
  equipment?: string;
  [key: string]: any;
};

export type MuscleGroup = "chest" | "back" | "shoulders" | "arms" | "legs" | "core";

export const MUSCLE_GROUPS: { key: MuscleGroup; label: string; muscles: string[] }[] = [
  { key: "chest", label: "Chest", muscles: ["chest"] },
  { key: "back", label: "Back", muscles: ["lats", "middle back", "lower back", "traps"] },
  { key: "shoulders", label: "Shoulders", muscles: ["shoulders", "neck"] },
  { key: "arms", label: "Arms", muscles: ["biceps", "triceps", "forearms"] },
  { key: "legs", label: "Legs", muscles: ["quadriceps", "hamstrings", "glutes", "calves", "adductors", "abductors"] },
  { key: "core", label: "Core", muscles: ["abdominals"] },
];

export function matchesMuscleGroup(ex: SearchableExercise, group: MuscleGroup | null): boolean {
  if (!group) return true;
  const muscles = MUSCLE_GROUPS.find((g) => g.key === group)?.muscles ?? [];
  return (ex.primaryMuscles ?? []).some((m) => muscles.includes(m.toLowerCase()));
}

// Common gym shorthand → the words the exercise list uses.
const ALIASES: Record<string, string> = {
  db: "dumbbell",
  dbs: "dumbbell",
  bb: "barbell",
  kb: "kettlebell",
  ohp: "overhead press",
  rdl: "romanian deadlift",
  bw: "bodyweight",
  abs: "abdominals",
  lat: "lats",
  tri: "triceps",
  tris: "triceps",
  bi: "biceps",
  bis: "biceps",
  quads: "quadriceps",
  hammies: "hamstrings",
  delts: "shoulders",
};

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function queryTokens(query: string): string[] {
  return normalize(query)
    .split(" ")
    .filter(Boolean)
    .flatMap((t) => (ALIASES[t] ?? t).split(" "));
}

/**
 * Search by every word, in any order, across name, muscles and equipment —
 * "incline db" finds "Incline Dumbbell Press". Name matches rank first:
 * name starts with the query, then every word starts a word in the name,
 * then the rest; ties alphabetical.
 */
export function searchExercises<T extends SearchableExercise>(list: T[], query: string): T[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [];
  const q = tokens.join(" ");
  const scored: { ex: T; score: number }[] = [];
  for (const ex of list) {
    if (!ex.name) continue;
    const name = normalize(ex.name);
    const haystack = `${name} ${normalize((ex.primaryMuscles ?? []).join(" "))} ${normalize(ex.equipment ?? "")}`;
    if (!tokens.every((t) => haystack.includes(t))) continue;
    const words = name.split(" ");
    let score = 0;
    if (name.startsWith(q)) score += 100;
    else if (name.includes(q)) score += 50;
    if (tokens.every((t) => words.some((w) => w.startsWith(t)))) score += 25;
    if (tokens.every((t) => name.includes(t))) score += 10;
    scored.push({ ex, score });
  }
  scored.sort((a, b) => b.score - a.score || a.ex.name.localeCompare(b.ex.name));
  return scored.map((s) => s.ex);
}

/** Put a just-picked exercise at the front of the recent list (no duplicates). */
export function pushRecent(recentIds: string[], id: string, max = 12): string[] {
  return [id, ...recentIds.filter((r) => r !== id)].slice(0, max);
}
