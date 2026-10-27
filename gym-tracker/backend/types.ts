// Shared row types for the data layer.
//
// These mirror the Supabase schema (see supabaseSchema.md) and are the single
// source of truth shared by db.tsx (online), localDb.tsx (offline) and
// offlineQueue.ts. Keep them in sync with the schema when columns change.

export type ExerciseType = "strength" | "cardio" | "stretching";
export type PRType = "strength" | "cardio";

export type User = {
  user_id: string;
  username: string;
  email: string;
  created_at: string;
  bio?: string | null;
  avatar_url?: string | null;
};

export type Routine = {
  routine_id: number;
  routine_name: string;
  description: string | null;
  user_id: string;
  created_at: string;
  routine_order?: number | null;
};

export type RoutineExercise = {
  routine_exercise_id: number;
  routine_id: number;
  exercise_id: string;
  exercise_name: string;
  exercise_order: number;
  exercise_type: ExerciseType;
};

export type RoutineExerciseSet = {
  routine_set_id: number;
  routine_exercise_id: number;
  set_number: number;
  target_weight: number | null;
  target_reps: number | null;
  is_warmup: boolean;
  target_duration_seconds: number | null;
  target_distance_meters: number | null;
  target_effort_level: number | null;
};

export type WorkoutSession = {
  session_id: number;
  routine_id: number | null;
  session_name: string;
  session_date: string; // date (YYYY-MM-DD)
  start_time: string; // time (HH:MM:SS)
  end_time: string | null; // time (HH:MM:SS)
  notes: string | null;
  photo_url: string | null;
  created_at: string;
  user_id: string;
};

export type SessionExercise = {
  session_exercise_id: number;
  session_id: number;
  exercise_id: string;
  exercise_name: string;
  exercise_order: number;
  notes: string | null;
  exercise_type: ExerciseType;
};

export type SessionExerciseSet = {
  session_set_id: number;
  session_exercise_id: number;
  set_number: number;
  weight: number | null;
  reps: number | null;
  is_warmup: boolean;
  completed: boolean;
  duration_seconds: number | null;
  distance_meters: number | null;
  pace_sec_per_km: number | null;
  calories: number | null;
  effort_level: number | null;
};

export type PersonalRecord = {
  pr_id: number;
  user_id: string;
  exercise_id: string;
  max_weight: number | null;
  max_volume: number | null;
  achieved_at: string;
  pr_type: PRType;
  best_distance_meters: number | null;
  best_pace_sec_per_km: number | null;
  best_duration_seconds: number | null;
};

export type CustomExercise = {
  exercise_id: string;
  user_id: string;
  name: string;
  primary_muscle: string | null;
  equipment: string | null;
  created_at: string;
  exercise_type: ExerciseType;
};

// Common result shape returned by both the Supabase and local backends.
// (Supabase responses carry extra fields, but every caller only reads these.)
export type DbError = { message: string };
export type DbResult<T> = { data: T | null; error: DbError | null };
