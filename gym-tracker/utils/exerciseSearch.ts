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

// The lifts most people mean when they type a short query ("bench",
// "squat", "row"), so they come before the variations. Ids from
// assets/data/exercises.json. Earlier in the list wins between two staples.
const STAPLES = [
  "Barbell_Bench_Press_-_Medium_Grip", "Dumbbell_Bench_Press", "Barbell_Incline_Bench_Press_-_Medium_Grip",
  "Barbell_Squat", "Barbell_Deadlift", "Romanian_Deadlift", "Leg_Press", "Barbell_Hip_Thrust",
  "Barbell_Shoulder_Press", "Dumbbell_Shoulder_Press", "Standing_Military_Press", "Side_Lateral_Raise",
  "Bent_Over_Barbell_Row", "One-Arm_Dumbbell_Row", "Seated_Cable_Rows", "Wide-Grip_Lat_Pulldown",
  "Pullups", "Chin-Up", "Pushups", "Parallel_Bar_Dip", "Barbell_Curl", "Hammer_Curls", "Preacher_Curl",
  "Triceps_Pushdown", "EZ-Bar_Skullcrusher", "Leg_Extensions", "Lying_Leg_Curls", "Seated_Leg_Curl",
  "Standing_Calf_Raises", "Barbell_Lunge", "Goblet_Squat", "Hack_Squat", "Dumbbell_Flyes", "Cable_Crossover",
  "Face_Pull", "Barbell_Shrug", "Plank", "Crunches", "Cable_Crunch", "Running_Treadmill", "Walking_Treadmill",
  "Bicycling_Stationary", "Rowing_Stationary", "Elliptical_Trainer",
];
export const STAPLE_EXERCISE_IDS = new Set(STAPLES);
const stapleRank = new Map(STAPLES.map((id, i) => [id, i]));

/**
 * Search by every word, in any order, across name, muscles and equipment —
 * "incline db" finds "Incline Dumbbell Press". Each word has to start a word
 * ("run" finds Running, not Crunch) unless that finds nothing, then any
 * substring counts. Name matches rank first: name starts with the query,
 * then contains it, then every word starts a word in the name; staple lifts
 * get a boost; ties go to the shorter (plainer) name, then alphabetical.
 */
export function searchExercises<T extends SearchableExercise>(list: T[], query: string): T[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [];
  const prefixHits = rank(list, tokens, true);
  return prefixHits.length > 0 ? prefixHits : rank(list, tokens, false);
}

function rank<T extends SearchableExercise>(list: T[], tokens: string[], wordStart: boolean): T[] {
  const q = tokens.join(" ");
  const scored: { ex: T; score: number; staple: number }[] = [];
  for (const ex of list) {
    if (!ex.name) continue;
    const name = normalize(ex.name);
    const haystack = `${name} ${normalize((ex.primaryMuscles ?? []).join(" "))} ${normalize(ex.equipment ?? "")}`;
    const hayWords = haystack.split(" ");
    const hit = (t: string) => (wordStart ? hayWords.some((w) => w.startsWith(t)) : haystack.includes(t));
    if (!tokens.every(hit)) continue;
    const words = name.split(" ");
    let score = 0;
    if (name === q || name.startsWith(`${q} `)) score += 100;
    else if (name.startsWith(q)) score += 70;
    else if (` ${name}`.includes(` ${q}`)) score += 60;
    else if (name.includes(q)) score += 50;
    if (tokens.every((t) => words.some((w) => w.startsWith(t)))) score += 25;
    // Whole words beat prefixes: "row" is a Row before it's Rowing.
    if (tokens.every((t) => words.some((w) => w === t || w === `${t}s`))) score += 15;
    if (tokens.every((t) => name.includes(t))) score += 10;
    if (STAPLE_EXERCISE_IDS.has(ex.id)) score += 80;
    scored.push({ ex, score, staple: stapleRank.get(ex.id) ?? Infinity });
  }
  scored.sort((a, b) =>
    b.score - a.score ||
    (a.staple === b.staple ? 0 : a.staple < b.staple ? -1 : 1) ||
    a.ex.name.length - b.ex.name.length ||
    a.ex.name.localeCompare(b.ex.name));
  return scored.map((s) => s.ex);
}

/** Put a just-picked exercise at the front of the recent list (no duplicates). */
export function pushRecent(recentIds: string[], id: string, max = 12): string[] {
  return [id, ...recentIds.filter((r) => r !== id)].slice(0, max);
}
