import type {
  User,
  Routine,
  ExerciseType,
  RoutineExercise,
  RoutineExerciseSet,
  WorkoutSession,
  SessionExercise,
  SessionExerciseSet,
  PersonalRecord,
  CustomExercise,
} from "./types";

let localUsers: User[] = [];
let localRoutines: Routine[] = [];
let localRoutineExercises: RoutineExercise[] = [];
let localRoutineExerciseSets: RoutineExerciseSet[] = [];
let localWorkoutSessions: WorkoutSession[] = [];
let localSessionExercises: SessionExercise[] = [];
let localSessionExerciseSets: SessionExerciseSet[] = [];
let localSession: { user: { id: string; email: string } } | null = null;

let localPersonalRecords: PersonalRecord[] = [];
let localCustomExercises: CustomExercise[] = [];
let nextPrId = 1;

let nextRoutineId = 1;
let nextRoutineExerciseId = 1;
let nextRoutineSetId = 1;
let nextSessionId = 1;
let nextSessionExerciseId = 1;
let nextSessionSetId = 1;

export const localDb = {
  // Auth
  signUp: async (email: string, password: string, username: string) => {
    const userId = `local-${Date.now()}`;
    const user: User = {
      user_id: userId,
      username,
      email,
      created_at: new Date().toISOString(),
    };
    localUsers.push(user);
    localSession = { user: { id: userId, email } };
    return { data: { user: { id: userId } }, error: null };
  },

  signIn: async (email: string, _password: string) => {
    const user = localUsers.find((u) => u.email === email);
    if (!user) {
      return { data: null, error: { message: "User not found" } };
    }
    localSession = { user: { id: user.user_id, email } };
    return { data: { user: { id: user.user_id } }, error: null };
  },

  signOut: async () => {
    localSession = null;
  },

  getSession: async () => {
    return { data: { session: localSession } };
  },

  getUser: async () => {
    return { data: { user: localSession?.user ?? null } };
  },

  getUserProfile: async (userId: string) => {
    const user = localUsers.find((u) => u.user_id === userId) ?? null;
    return { data: user, error: user ? null : { message: "User not found" } };
  },

  updateUserProfile: async (userId: string, updates: { username?: string; bio?: string | null; avatar_url?: string | null }) => {
    const user = localUsers.find((u) => u.user_id === userId);
    if (!user) return { data: null, error: { message: "User not found" } };
    Object.assign(user, updates);
    return { data: user, error: null };
  },

  changePassword: async (_newPassword: string) => {
    return { data: null, error: { message: "Password changes require an internet connection." } };
  },

  onAuthStateChange: (callback: (event: string, session: any) => void) => {
    return {
      data: {
        subscription: {
          unsubscribe: () => {},
        },
      },
    };
  },

  // Users
  getUsers: async () => {
    return { data: localUsers, error: null };
  },

  // Routines
  getRoutines: async () => {
    const userId = localSession?.user?.id;
    const data = localRoutines.filter((r) => r.user_id === userId);
    return { data, error: null };
  },

  insertRoutine: async (routine: { routine_name: string; description: string | null; user_id: string }) => {
    const newRoutine: Routine = {
      routine_id: nextRoutineId++,
      ...routine,
      created_at: new Date().toISOString(),
    };
    localRoutines.push(newRoutine);
    return { data: newRoutine, error: null };
  },

  updateRoutine: async (routineId: number, updates: { routine_name?: string; description?: string | null; routine_order?: number }) => {
    localRoutines = localRoutines.map((r) =>
      r.routine_id === routineId ? { ...r, ...updates } : r
    );
    return { error: null };
  },

  deleteRoutine: async (routineId: number) => {
    // Delete sets for exercises in this routine
    const exerciseIds = localRoutineExercises
      .filter((re) => re.routine_id === routineId)
      .map((re) => re.routine_exercise_id);
    localRoutineExerciseSets = localRoutineExerciseSets.filter(
      (s) => !exerciseIds.includes(s.routine_exercise_id)
    );
    localRoutineExercises = localRoutineExercises.filter((re) => re.routine_id !== routineId);
    localRoutines = localRoutines.filter((r) => r.routine_id !== routineId);
    return { error: null };
  },

  // Routine Exercises
  getRoutineExercises: async (routineId: number) => {
    const data = localRoutineExercises
      .filter((re) => re.routine_id === routineId)
      .sort((a, b) => a.exercise_order - b.exercise_order);
    return { data, error: null };
  },

  insertRoutineExercise: async (exercise: {
    routine_id: number;
    exercise_id: string;
    exercise_name: string;
    exercise_order: number;
    exercise_type?: ExerciseType;
  }) => {
    const newExercise: RoutineExercise = {
      routine_exercise_id: nextRoutineExerciseId++,
      exercise_type: 'strength',
      ...exercise,
    };
    localRoutineExercises.push(newExercise);
    return { data: newExercise, error: null };
  },

  deleteRoutineExercise: async (routineExerciseId: number) => {
    // Also delete associated sets
    localRoutineExerciseSets = localRoutineExerciseSets.filter(
      (s) => s.routine_exercise_id !== routineExerciseId
    );
    localRoutineExercises = localRoutineExercises.filter(
      (re) => re.routine_exercise_id !== routineExerciseId
    );
    return { error: null };
  },

  updateRoutineExercise: async (routineExerciseId: number, updates: { exercise_id?: string; exercise_name?: string }) => {
    localRoutineExercises = localRoutineExercises.map((e) =>
      e.routine_exercise_id === routineExerciseId ? { ...e, ...updates } : e
    );
    return { error: null };
  },

  // Routine Exercise Sets (template sets)
  getRoutineExerciseSets: async (routineExerciseId: number) => {
    const data = localRoutineExerciseSets
      .filter((s) => s.routine_exercise_id === routineExerciseId)
      .sort((a, b) => a.set_number - b.set_number);
    return { data, error: null };
  },

  insertRoutineExerciseSet: async (set: {
    routine_exercise_id: number;
    set_number: number;
    target_weight: number | null;
    target_reps: number | null;
    is_warmup: boolean;
    target_duration_seconds?: number | null;
    target_distance_meters?: number | null;
    target_effort_level?: number | null;
  }) => {
    const newSet: RoutineExerciseSet = {
      routine_set_id: nextRoutineSetId++,
      target_duration_seconds: null,
      target_distance_meters: null,
      target_effort_level: null,
      ...set,
    };
    localRoutineExerciseSets.push(newSet);
    return { error: null };
  },

  deleteRoutineExerciseSet: async (routineSetId: number) => {
    localRoutineExerciseSets = localRoutineExerciseSets.filter(
      (s) => s.routine_set_id !== routineSetId
    );
    return { error: null };
  },

  updateRoutineExerciseSet: async (
    routineSetId: number,
    updates: { target_reps?: number | null; target_weight?: number | null; is_warmup?: boolean; target_duration_seconds?: number | null; target_distance_meters?: number | null; target_effort_level?: number | null }
  ) => {
    localRoutineExerciseSets = localRoutineExerciseSets.map((s) =>
      s.routine_set_id === routineSetId ? { ...s, ...updates } : s
    );
    return { error: null };
  },

  // ===== WORKOUT SESSIONS =====

  // Start a new workout session (optionally from a routine)
  startWorkoutSession: async (params: {
    routine_id: number | null;
    session_name: string;
    user_id: string;
  }) => {
    const now = new Date();
    const session: WorkoutSession = {
      session_id: nextSessionId++,
      routine_id: params.routine_id,
      session_name: params.session_name,
      session_date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
      start_time: now.toTimeString().split(" ")[0],
      end_time: null,
      notes: null,
      photo_url: null,
      created_at: now.toISOString(),
      user_id: params.user_id,
    };
    localWorkoutSessions.push(session);
    return { data: session, error: null };
  },

  // Finish a workout session
  finishWorkoutSession: async (sessionId: number, notes?: string | null) => {
    const now = new Date();
    localWorkoutSessions = localWorkoutSessions.map((s) =>
      s.session_id === sessionId
        ? { ...s, end_time: now.toTimeString().split(" ")[0], notes: notes ?? s.notes }
        : s
    );
    return { error: null };
  },

  // Get all completed sessions for the user (history)
  getWorkoutSessions: async (userId: string) => {
    const data = localWorkoutSessions
      .filter((s) => s.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { data, error: null };
  },

  // Get a single session by ID
  getWorkoutSession: async (sessionId: number) => {
    const session = localWorkoutSessions.find((s) => s.session_id === sessionId) ?? null;
    return { data: session, error: session ? null : { message: "Session not found" } };
  },

  // Get the active (unfinished) session
  getActiveSession: async (userId: string) => {
    const session = localWorkoutSessions.find(
      (s) => s.user_id === userId && s.end_time === null
    ) ?? null;
    return { data: session, error: null };
  },

  // Update session notes
  updateWorkoutSession: async (sessionId: number, updates: { notes?: string | null; session_name?: string }) => {
    localWorkoutSessions = localWorkoutSessions.map((s) =>
      s.session_id === sessionId ? { ...s, ...updates } : s
    );
    return { error: null };
  },

  // Save a progress photo URI (local file URI for offline sessions)
  updateSessionPhotoUrl: async (sessionId: number, photoUrl: string | null) => {
    localWorkoutSessions = localWorkoutSessions.map((s) =>
      s.session_id === sessionId ? { ...s, photo_url: photoUrl } : s
    );
    return { error: null };
  },

  // Delete a session and all its exercises/sets
  deleteWorkoutSession: async (sessionId: number) => {
    const exerciseIds = localSessionExercises
      .filter((e) => e.session_id === sessionId)
      .map((e) => e.session_exercise_id);
    localSessionExerciseSets = localSessionExerciseSets.filter(
      (s) => !exerciseIds.includes(s.session_exercise_id)
    );
    localSessionExercises = localSessionExercises.filter((e) => e.session_id !== sessionId);
    localWorkoutSessions = localWorkoutSessions.filter((s) => s.session_id !== sessionId);
    return { error: null };
  },

  // ===== SESSION EXERCISES =====

  getSessionExercises: async (sessionId: number) => {
    const data = localSessionExercises
      .filter((e) => e.session_id === sessionId)
      .sort((a, b) => a.exercise_order - b.exercise_order);
    return { data, error: null };
  },

  insertSessionExercise: async (exercise: {
    session_id: number;
    exercise_id: string;
    exercise_name: string;
    exercise_order: number;
    notes: string | null;
    exercise_type?: ExerciseType;
  }) => {
    const newExercise: SessionExercise = {
      session_exercise_id: nextSessionExerciseId++,
      exercise_type: 'strength',
      ...exercise,
    };
    localSessionExercises.push(newExercise);
    return { data: newExercise, error: null };
  },

  updateSessionExercise: async (sessionExerciseId: number, updates: { notes?: string; exercise_id?: string; exercise_name?: string }) => {
    localSessionExercises = localSessionExercises.map((e) =>
      e.session_exercise_id === sessionExerciseId ? { ...e, ...updates } : e
    );
    return { error: null };
  },

  deleteSessionExercise: async (sessionExerciseId: number) => {
    localSessionExerciseSets = localSessionExerciseSets.filter(
      (s) => s.session_exercise_id !== sessionExerciseId
    );
    localSessionExercises = localSessionExercises.filter(
      (e) => e.session_exercise_id !== sessionExerciseId
    );
    return { error: null };
  },

  // ===== SESSION EXERCISE SETS =====

  getSessionExerciseSets: async (sessionExerciseId: number) => {
    const data = localSessionExerciseSets
      .filter((s) => s.session_exercise_id === sessionExerciseId)
      .sort((a, b) => a.set_number - b.set_number);
    return { data, error: null };
  },

  insertSessionExerciseSet: async (set: {
    session_exercise_id: number;
    set_number: number;
    weight: number | null;
    reps: number | null;
    is_warmup: boolean;
    completed?: boolean;
    duration_seconds?: number | null;
    distance_meters?: number | null;
    pace_sec_per_km?: number | null;
    calories?: number | null;
    effort_level?: number | null;
  }) => {
    const newSet: SessionExerciseSet = {
      session_set_id: nextSessionSetId++,
      completed: false,
      duration_seconds: null,
      distance_meters: null,
      pace_sec_per_km: null,
      calories: null,
      effort_level: null,
      ...set,
    };
    localSessionExerciseSets.push(newSet);
    return { data: newSet, error: null };
  },

  updateSessionExerciseSet: async (
    sessionSetId: number,
    updates: { reps?: number | null; weight?: number | null; is_warmup?: boolean; completed?: boolean; duration_seconds?: number | null; distance_meters?: number | null; pace_sec_per_km?: number | null; calories?: number | null; effort_level?: number | null }
  ) => {
    localSessionExerciseSets = localSessionExerciseSets.map((s) =>
      s.session_set_id === sessionSetId ? { ...s, ...updates } : s
    );
    return { error: null };
  },

  deleteSessionExerciseSet: async (sessionSetId: number) => {
    localSessionExerciseSets = localSessionExerciseSets.filter(
      (s) => s.session_set_id !== sessionSetId
    );
    return { error: null };
  },

  // ===== START WORKOUT FROM ROUTINE =====
  // Copies routine template into a live session
  startWorkoutFromRoutine: async (routineId: number, userId: string) => {
    const routine = localRoutines.find((r) => r.routine_id === routineId);
    if (!routine) return { data: null, error: { message: "Routine not found" } };

    // Create session
    const now = new Date();
    const session: WorkoutSession = {
      session_id: nextSessionId++,
      routine_id: routineId,
      session_name: routine.routine_name,
      session_date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
      start_time: now.toTimeString().split(" ")[0],
      end_time: null,
      notes: null,
      photo_url: null,
      created_at: now.toISOString(),
      user_id: userId,
    };
    localWorkoutSessions.push(session);

    // Copy exercises
    const routineExercises = localRoutineExercises
      .filter((re) => re.routine_id === routineId)
      .sort((a, b) => a.exercise_order - b.exercise_order);

    for (const re of routineExercises) {
      const sessionExercise: SessionExercise = {
        session_exercise_id: nextSessionExerciseId++,
        session_id: session.session_id,
        exercise_id: re.exercise_id,
        exercise_name: re.exercise_name,
        exercise_order: re.exercise_order,
        notes: null,
        exercise_type: re.exercise_type ?? 'strength',
      };
      localSessionExercises.push(sessionExercise);

      // Copy template sets
      const templateSets = localRoutineExerciseSets
        .filter((s) => s.routine_exercise_id === re.routine_exercise_id)
        .sort((a, b) => a.set_number - b.set_number);

      for (const ts of templateSets) {
        const sessionSet: SessionExerciseSet = {
          session_set_id: nextSessionSetId++,
          session_exercise_id: sessionExercise.session_exercise_id,
          set_number: ts.set_number,
          weight: ts.target_weight,
          reps: ts.target_reps,
          is_warmup: ts.is_warmup,
          completed: false,
          duration_seconds: ts.target_duration_seconds ?? null,
          distance_meters: ts.target_distance_meters ?? null,
          pace_sec_per_km: null,
          calories: null,
          effort_level: ts.target_effort_level ?? null,
        };
        localSessionExerciseSets.push(sessionSet);
      }
    }

    return { data: session, error: null };
  },

  // Previous performance hints
  getPreviousSessionSets: async (exerciseId: string, userId: string, excludeSessionId: number) => {
    const prevSession = localWorkoutSessions
      .filter((s) => s.user_id === userId && s.end_time !== null && s.session_id !== excludeSessionId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    if (!prevSession) return { data: [], error: null };
    const prevEx = localSessionExercises.find(
      (e) => e.session_id === prevSession.session_id && e.exercise_id === exerciseId
    );
    if (!prevEx) return { data: [], error: null };
    const data = localSessionExerciseSets
      .filter((s) => s.session_exercise_id === prevEx.session_exercise_id)
      .sort((a, b) => a.set_number - b.set_number);
    return { data, error: null };
  },

  // Personal Records
  getPersonalRecords: async (userId: string) => {
    const data = localPersonalRecords.filter((r) => r.user_id === userId);
    return { data, error: null };
  },

  upsertPersonalRecord: async (record: {
    user_id: string;
    exercise_id: string;
    max_weight: number | null;
    max_volume: number | null;
    pr_type?: 'strength' | 'cardio';
    best_distance_meters?: number | null;
    best_pace_sec_per_km?: number | null;
    best_duration_seconds?: number | null;
  }) => {
    const prType = record.pr_type ?? 'strength';
    const existing = localPersonalRecords.findIndex(
      (r) => r.user_id === record.user_id && r.exercise_id === record.exercise_id && r.pr_type === prType
    );
    if (existing >= 0) {
      localPersonalRecords[existing] = {
        ...localPersonalRecords[existing],
        max_weight: record.max_weight,
        max_volume: record.max_volume,
        best_distance_meters: record.best_distance_meters ?? null,
        best_pace_sec_per_km: record.best_pace_sec_per_km ?? null,
        best_duration_seconds: record.best_duration_seconds ?? null,
        achieved_at: new Date().toISOString(),
      };
    } else {
      localPersonalRecords.push({
        pr_id: nextPrId++,
        pr_type: prType,
        best_distance_meters: record.best_distance_meters ?? null,
        best_pace_sec_per_km: record.best_pace_sec_per_km ?? null,
        best_duration_seconds: record.best_duration_seconds ?? null,
        ...record,
        achieved_at: new Date().toISOString(),
      });
    }
    return { error: null };
  },

  // Custom Exercises
  getCustomExercises: async (userId: string) => {
    const data = localCustomExercises.filter((e) => e.user_id === userId);
    return { data, error: null };
  },

  insertCustomExercise: async (exercise: {
    exercise_id: string;
    user_id: string;
    name: string;
    primary_muscle: string | null;
    equipment: string | null;
    exercise_type?: ExerciseType;
  }) => {
    localCustomExercises.push({ exercise_type: 'strength', ...exercise, created_at: new Date().toISOString() });
    return { error: null };
  },

  deleteCustomExercise: async (exerciseId: string) => {
    localCustomExercises = localCustomExercises.filter((e) => e.exercise_id !== exerciseId);
    return { error: null };
  },

  // Cardio aggregate stats for a user
  getCardioStats: async (userId: string) => {
    const userSessions = localWorkoutSessions.filter(
      (s) => s.user_id === userId && s.end_time !== null
    );
    const sessionIds = new Set(userSessions.map((s) => s.session_id));

    const cardioExerciseIds = new Set(
      localSessionExercises
        .filter((e) => sessionIds.has(e.session_id) && e.exercise_type === 'cardio')
        .map((e) => e.session_exercise_id)
    );

    const cardioSets = localSessionExerciseSets.filter(
      (s) => cardioExerciseIds.has(s.session_exercise_id) && s.completed &&
        (s.duration_seconds != null || s.distance_meters != null)
    );

    let totalDistanceMeters = 0;
    let totalDurationSeconds = 0;
    let longestRunMeters = 0;
    let fastestPaceSecPerKm: number | null = null;

    for (const s of cardioSets) {
      totalDistanceMeters += s.distance_meters ?? 0;
      totalDurationSeconds += s.duration_seconds ?? 0;
      if ((s.distance_meters ?? 0) > longestRunMeters) longestRunMeters = s.distance_meters!;
      const pace = s.pace_sec_per_km;
      if (pace != null && pace > 0) {
        if (fastestPaceSecPerKm === null || pace < fastestPaceSecPerKm) fastestPaceSecPerKm = pace;
      }
    }

    // Count distinct sessions that contain at least one cardio exercise
    const cardioSessionIds = new Set(
      localSessionExercises
        .filter((e) => sessionIds.has(e.session_id) && e.exercise_type === 'cardio')
        .map((e) => e.session_id)
    );

    return {
      data: {
        totalDistanceMeters,
        totalDurationSeconds,
        totalCardioSessions: cardioSessionIds.size,
        longestRunMeters,
        fastestPaceSecPerKm,
      },
      error: null,
    };
  },

  // Exercise history for progression charts
  getExerciseHistory: async (exerciseId: string, userId: string) => {
    const completedSessions = localWorkoutSessions
      .filter((s) => s.user_id === userId && s.end_time !== null)
      .sort((a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime());

    const history = completedSessions
      .map((s) => {
        const se = localSessionExercises.find(
          (e) => e.session_id === s.session_id && e.exercise_id === exerciseId
        );
        if (!se) return null;
        const sets = localSessionExerciseSets.filter(
          (set) => set.session_exercise_id === se.session_exercise_id && set.completed
        );
        return { session_date: s.session_date, sets };
      })
      .filter(Boolean);

    return { data: history, error: null };
  },
};