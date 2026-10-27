import { supabase } from "./supabaseClient";
import { localDb } from "./localDb";
import { networkStatus } from "./networkStatus";
import {
  enqueuePendingSession,
  getPendingQueue,
  removeFromQueue,
  getPendingCount,
  markSessionOrigin,
  getSessionOrigin,
  clearSessionOrigin,
} from "./offlineQueue";
import { buildExerciseIdMap, remapSetsForInsert } from "./syncMapping";
import { cachedRead, clearReadCache } from "./readCache";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// isOnline = Supabase is configured (build-time check)
export const isOnline = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

// shouldUseSupabase = Supabase configured AND network available (runtime check)
const shouldUseSupabase = () => isOnline && networkStatus.isConnected;

export const db = {
  // Auth
  signUp: async (email: string, password: string, username: string) => {
    if (shouldUseSupabase()) {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) return { data: null, error: signUpError };
      if (data.user) {
        const { error: insertError } = await supabase.from("users").insert({
          user_id: data.user.id,
          username,
          email,
          password_hash: "managed_by_supabase_auth",
        });
        if (insertError) return { data: null, error: insertError };
      }
      return { data, error: null };
    }
    return localDb.signUp(email, password, username);
  },

  signIn: async (email: string, password: string) => {
    if (shouldUseSupabase()) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error };
    }
    return localDb.signIn(email, password);
  },

  resetPassword: async (email: string) => {
    if (!shouldUseSupabase()) return { error: { message: "Requires internet connection to reset password." } };
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return { error };
  },

  signOut: async () => {
    if (shouldUseSupabase()) {
      await supabase.auth.signOut();
    } else {
      await localDb.signOut();
    }
    // Drop cached reads so the next user can't see the previous user's data.
    await clearReadCache();
  },

  getSession: async () => {
    if (shouldUseSupabase()) {
      return supabase.auth.getSession();
    }
    return localDb.getSession();
  },

  getUser: async () => {
    if (shouldUseSupabase()) {
      return supabase.auth.getUser();
    }
    return localDb.getUser();
  },

  getUserProfile: async (userId: string) => {
    return cachedRead(
      shouldUseSupabase(),
      `userProfile:${userId}`,
      () => supabase.from("users").select("*").eq("user_id", userId).single(),
      () => localDb.getUserProfile(userId),
    );
  },

  updateUserProfile: async (userId: string, updates: { username?: string; bio?: string | null; avatar_url?: string | null }) => {
    if (shouldUseSupabase()) {
      return supabase.from("users").update(updates).eq("user_id", userId);
    }
    return localDb.updateUserProfile(userId, updates);
  },

  uploadAvatar: async (userId: string, uri: string): Promise<{ url: string | null; error: string | null }> => {
    if (!shouldUseSupabase()) return { url: null, error: "Requires internet connection" };
    try {
      const ext = (uri.split(".").pop()?.split("?")[0]?.toLowerCase()) ?? "jpg";
      const mimeType = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : "image/jpeg";
      const path = `${userId}/avatar.${ext}`;
      // Use FormData instead of fetch().blob() — fetch() on local file:// / content://
      // URIs is unreliable on Android and often returns an empty blob.
      const formData = new FormData();
      formData.append("file", { uri, name: `avatar.${ext}`, type: mimeType } as any);
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, formData, { upsert: true, contentType: mimeType });
      if (uploadError) return { url: null, error: uploadError.message };
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      // Bust cache by appending a timestamp
      return { url: `${data.publicUrl}?t=${Date.now()}`, error: null };
    } catch (e: any) {
      return { url: null, error: e.message ?? "Upload failed" };
    }
  },

  uploadProgressPhoto: async (userId: string, sessionId: number, uri: string): Promise<{ url: string | null; error: string | null }> => {
    if (!shouldUseSupabase()) return { url: null, error: "Requires internet connection" };
    try {
      const ext = (uri.split(".").pop()?.split("?")[0]?.toLowerCase()) ?? "jpg";
      const mimeType = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : "image/jpeg";
      const path = `${userId}/${sessionId}.${ext}`;
      const formData = new FormData();
      formData.append("file", { uri, name: `progress.${ext}`, type: mimeType } as any);
      const { error: uploadError } = await supabase.storage
        .from("progress-photos")
        .upload(path, formData, { upsert: true, contentType: mimeType });
      if (uploadError) return { url: null, error: uploadError.message };
      const { data } = supabase.storage.from("progress-photos").getPublicUrl(path);
      return { url: `${data.publicUrl}?t=${Date.now()}`, error: null };
    } catch (e: any) {
      return { url: null, error: e.message ?? "Upload failed" };
    }
  },

  updateSessionPhotoUrl: async (sessionId: number, photoUrl: string | null) => {
    if (shouldUseSupabase()) {
      return supabase.from("workout_sessions").update({ photo_url: photoUrl }).eq("session_id", sessionId);
    }
    return localDb.updateSessionPhotoUrl(sessionId, photoUrl);
  },

  changePassword: async (newPassword: string) => {
    if (shouldUseSupabase()) {
      return supabase.auth.updateUser({ password: newPassword });
    }
    return { data: null, error: { message: "Password changes require an internet connection." } };
  },

  onAuthStateChange: (callback: (event: string, session: any) => void) => {
    if (shouldUseSupabase()) {
      return supabase.auth.onAuthStateChange(callback);
    }
    return localDb.onAuthStateChange(callback);
  },

  // Users
  getUsers: async () => {
    if (shouldUseSupabase()) {
      return supabase.from("users").select("*");
    }
    return localDb.getUsers();
  },

  // Routines
  getRoutines: async () => {
    return cachedRead(
      shouldUseSupabase(),
      "routines",
      () => supabase.from("routines").select("*"),
      () => localDb.getRoutines(),
    );
  },

  insertRoutine: async (routine: { routine_name: string; description: string | null; user_id: string }) => {
    if (shouldUseSupabase()) {
      return supabase.from("routines").insert(routine).select().single();
    }
    return localDb.insertRoutine(routine);
  },

  updateRoutine: async (routineId: number, updates: { routine_name?: string; description?: string | null; routine_order?: number }) => {
    if (shouldUseSupabase()) {
      return supabase.from("routines").update(updates).eq("routine_id", routineId);
    }
    return localDb.updateRoutine(routineId, updates);
  },

  deleteRoutine: async (routineId: number) => {
    if (shouldUseSupabase()) {
      return supabase.from("routines").delete().eq("routine_id", routineId);
    }
    return localDb.deleteRoutine(routineId);
  },

  // Routine Exercises
  getRoutineExercises: async (routineId: number) => {
    return cachedRead(
      shouldUseSupabase(),
      `routineExercises:${routineId}`,
      () => supabase
        .from("routine_exercises")
        .select("*")
        .eq("routine_id", routineId)
        .order("exercise_order", { ascending: true }),
      () => localDb.getRoutineExercises(routineId),
    );
  },

  insertRoutineExercise: async (exercise: {
    routine_id: number;
    exercise_id: string;
    exercise_name: string;
    exercise_order: number;
    exercise_type?: 'strength' | 'cardio' | 'stretching';
  }) => {
    if (shouldUseSupabase()) {
      return supabase.from("routine_exercises").insert({ exercise_type: 'strength', ...exercise }).select().single();
    }
    return localDb.insertRoutineExercise(exercise);
  },

  deleteRoutineExercise: async (routineExerciseId: number) => {
    if (shouldUseSupabase()) {
      return supabase.from("routine_exercises").delete().eq("routine_exercise_id", routineExerciseId);
    }
    return localDb.deleteRoutineExercise(routineExerciseId);
  },

  updateRoutineExercise: async (routineExerciseId: number, updates: { exercise_id?: string; exercise_name?: string }) => {
    if (shouldUseSupabase()) {
      return supabase.from("routine_exercises").update(updates).eq("routine_exercise_id", routineExerciseId);
    }
    return localDb.updateRoutineExercise(routineExerciseId, updates);
  },

  // Routine Exercise Sets (template sets)
  getRoutineExerciseSets: async (routineExerciseId: number) => {
    return cachedRead(
      shouldUseSupabase(),
      `routineExerciseSets:${routineExerciseId}`,
      () => supabase
        .from("routine_exercise_sets")
        .select("*")
        .eq("routine_exercise_id", routineExerciseId)
        .order("set_number", { ascending: true }),
      () => localDb.getRoutineExerciseSets(routineExerciseId),
    );
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
    if (shouldUseSupabase()) {
      return supabase.from("routine_exercise_sets").insert(set);
    }
    return localDb.insertRoutineExerciseSet(set);
  },

  deleteRoutineExerciseSet: async (routineSetId: number) => {
    if (shouldUseSupabase()) {
      return supabase.from("routine_exercise_sets").delete().eq("routine_set_id", routineSetId);
    }
    return localDb.deleteRoutineExerciseSet(routineSetId);
  },

  updateRoutineExerciseSet: async (
    routineSetId: number,
    updates: { target_reps?: number | null; target_weight?: number | null; is_warmup?: boolean; target_duration_seconds?: number | null; target_distance_meters?: number | null; target_effort_level?: number | null }
  ) => {
    if (shouldUseSupabase()) {
      return supabase
        .from("routine_exercise_sets")
        .update(updates)
        .eq("routine_set_id", routineSetId);
    }
    return localDb.updateRoutineExerciseSet(routineSetId, updates);
  },

  // Workout Sessions
  startWorkoutSession: async (params: { routine_id: number | null; session_name: string; user_id: string }) => {
    if (shouldUseSupabase()) {
      const now = new Date();
      const result = await supabase.from("workout_sessions").insert({
        routine_id: params.routine_id,
        session_name: params.session_name,
        session_date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
        start_time: now.toTimeString().split(" ")[0],
        user_id: params.user_id,
      }).select().single();
      if (result.data) await markSessionOrigin(result.data.session_id, false);
      return result;
    }
    const result = await localDb.startWorkoutSession(params);
    if (result.data) await markSessionOrigin(result.data.session_id, true);
    return result;
  },

  finishWorkoutSession: async (sessionId: number, notes?: string | null) => {
    if (shouldUseSupabase()) {
      const now = new Date();
      const result = await supabase.from("workout_sessions").update({
        end_time: now.toTimeString().split(" ")[0],
        notes,
      }).eq("session_id", sessionId);
      await clearSessionOrigin();
      return result;
    }
    // Offline: finish locally then queue the full session tree for later sync
    const result = await localDb.finishWorkoutSession(sessionId, notes);
    const origin = await getSessionOrigin();
    if (origin?.isLocal) {
      const [{ data: session }, { data: exercises }] = await Promise.all([
        localDb.getWorkoutSession(sessionId),
        localDb.getSessionExercises(sessionId),
      ]);
      const sets = (
        await Promise.all((exercises ?? []).map(ex => localDb.getSessionExerciseSets(ex.session_exercise_id)))
      ).flatMap(r => r.data ?? []);
      if (session) {
        await enqueuePendingSession({
          session: {
            routine_id: session.routine_id,
            session_name: session.session_name,
            session_date: session.session_date,
            start_time: session.start_time,
            end_time: session.end_time,
            notes: session.notes,
            user_id: session.user_id,
          },
          exercises: (exercises ?? []).map(ex => ({
            session_exercise_id: ex.session_exercise_id,
            exercise_id: ex.exercise_id,
            exercise_name: ex.exercise_name,
            exercise_order: ex.exercise_order,
            notes: ex.notes,
            exercise_type: ex.exercise_type,
          })),
          sets,
        });
      }
    }
    await clearSessionOrigin();
    return result;
  },

  // Sync completed session sets back to the routine template targets.
  // Called after finishing a workout so the routine reflects what was actually done.
  syncSessionSetsToRoutine: async (sessionId: number, routineId: number) => {
    if (shouldUseSupabase()) {
      // Fetch session exercises + routine exercises in parallel
      const [{ data: sessionExercises }, { data: routineExercises }] = await Promise.all([
        supabase.from("session_exercises").select("*").eq("session_id", sessionId),
        supabase.from("routine_exercises").select("*").eq("routine_id", routineId),
      ]);
      if (!sessionExercises?.length || !routineExercises?.length) return;

      const sessionExIds = sessionExercises.map((e: any) => e.session_exercise_id);
      const routineExIds = routineExercises.map((e: any) => e.routine_exercise_id);

      // Fetch all sets in parallel
      const [{ data: sessionSets }, { data: routineSets }] = await Promise.all([
        supabase.from("session_exercise_sets").select("*").in("session_exercise_id", sessionExIds),
        supabase.from("routine_exercise_sets").select("*").in("routine_exercise_id", routineExIds),
      ]);

      // Build lookup: routineExerciseId:setNumber → routineSetId
      const routineSetMap = new Map<string, number>();
      for (const rs of routineSets ?? []) {
        routineSetMap.set(`${rs.routine_exercise_id}:${rs.set_number}`, rs.routine_set_id);
      }

      // Map exercise_id → routine exercise
      const routineExByExId = new Map((routineExercises ?? []).map((e: any) => [e.exercise_id, e]));

      const updates: PromiseLike<any>[] = [];
      for (const sessionEx of sessionExercises) {
        const routineEx = routineExByExId.get(sessionEx.exercise_id);
        if (!routineEx) continue;

        const completedSets = (sessionSets ?? []).filter(
          (s: any) => s.session_exercise_id === sessionEx.session_exercise_id && s.completed
        );
        for (const ss of completedSets) {
          const routineSetId = routineSetMap.get(`${routineEx.routine_exercise_id}:${ss.set_number}`);
          if (routineSetId == null) continue;

          const payload =
            sessionEx.exercise_type === "cardio"
              ? { target_distance_meters: ss.distance_meters ?? null, target_duration_seconds: ss.duration_seconds ?? null }
              : { target_weight: ss.weight ?? null, target_reps: ss.reps ?? null };

          updates.push(
            supabase.from("routine_exercise_sets").update(payload).eq("routine_set_id", routineSetId)
          );
        }
      }
      await Promise.all(updates);
      return;
    }

    // Local fallback — delegate row-by-row via existing updateRoutineExerciseSet
    const [{ data: sessionExercises }, { data: routineExercises }] = await Promise.all([
      localDb.getSessionExercises(sessionId),
      localDb.getRoutineExercises(routineId),
    ]);
    if (!sessionExercises?.length || !routineExercises?.length) return;

    const routineExByExId = new Map((routineExercises ?? []).map((e: any) => [e.exercise_id, e]));

    for (const sessionEx of sessionExercises) {
      const routineEx = routineExByExId.get(sessionEx.exercise_id);
      if (!routineEx) continue;

      const { data: sessionSets } = await localDb.getSessionExerciseSets(sessionEx.session_exercise_id);
      const { data: routineSets } = await localDb.getRoutineExerciseSets(routineEx.routine_exercise_id);
      const routineSetMap = new Map<number, number>(
        (routineSets ?? []).map((rs: any) => [rs.set_number, rs.routine_set_id])
      );

      for (const ss of (sessionSets ?? []).filter((s: any) => s.completed)) {
        const routineSetId = routineSetMap.get(ss.set_number);
        if (routineSetId == null) continue;

        const payload =
          sessionEx.exercise_type === "cardio"
            ? { target_distance_meters: ss.distance_meters ?? null, target_duration_seconds: ss.duration_seconds ?? null }
            : { target_weight: ss.weight ?? null, target_reps: ss.reps ?? null };

        await localDb.updateRoutineExerciseSet(routineSetId, payload);
      }
    }
  },

  getWorkoutSessions: async (userId: string) => {
    return cachedRead(
      shouldUseSupabase(),
      `workoutSessions:${userId}`,
      () => supabase.from("workout_sessions")
        .select("*")
        .eq("user_id", userId)
        .not("end_time", "is", null)
        .order("created_at", { ascending: false }),
      () => localDb.getWorkoutSessions(userId),
    );
  },

  getWorkoutSession: async (sessionId: number) => {
    return cachedRead(
      shouldUseSupabase(),
      `workoutSession:${sessionId}`,
      () => supabase.from("workout_sessions")
        .select("*")
        .eq("session_id", sessionId)
        .single(),
      () => localDb.getWorkoutSession(sessionId),
    );
  },

  getActiveSession: async (userId: string) => {
    if (shouldUseSupabase()) {
      return supabase.from("workout_sessions")
        .select("*")
        .eq("user_id", userId)
        .is("end_time", null)
        .maybeSingle();
    }
    return localDb.getActiveSession(userId);
  },

  updateWorkoutSession: async (sessionId: number, updates: { notes?: string | null; session_name?: string }) => {
    if (shouldUseSupabase()) {
      return supabase.from("workout_sessions")
        .update(updates)
        .eq("session_id", sessionId);
    }
    return localDb.updateWorkoutSession(sessionId, updates);
  },

  deleteWorkoutSession: async (sessionId: number) => {
    if (shouldUseSupabase()) {
      // Delete child records first (Supabase won't cascade unless FK has ON DELETE CASCADE)
      const { data: exercises } = await supabase.from("session_exercises")
        .select("session_exercise_id")
        .eq("session_id", sessionId);

      // Delete all child sets in one request instead of one per exercise.
      const exerciseIds = (exercises ?? []).map((ex: any) => ex.session_exercise_id);
      if (exerciseIds.length > 0) {
        await supabase.from("session_exercise_sets")
          .delete()
          .in("session_exercise_id", exerciseIds);
      }
      await supabase.from("session_exercises").delete().eq("session_id", sessionId);
      return supabase.from("workout_sessions").delete().eq("session_id", sessionId);
    }
    return localDb.deleteWorkoutSession(sessionId);
  },

  // Session Exercises
  getSessionExercises: async (sessionId: number) => {
    return cachedRead(
      shouldUseSupabase(),
      `sessionExercises:${sessionId}`,
      () => supabase.from("session_exercises")
        .select("*")
        .eq("session_id", sessionId)
        .order("exercise_order"),
      () => localDb.getSessionExercises(sessionId),
    );
  },

  insertSessionExercise: async (exercise: { session_id: number; exercise_id: string; exercise_name: string; exercise_order: number; notes: string | null; exercise_type?: 'strength' | 'cardio' | 'stretching' }) => {
    if (shouldUseSupabase()) {
      return supabase.from("session_exercises").insert({ exercise_type: 'strength', ...exercise }).select().single();
    }
    return localDb.insertSessionExercise(exercise);
  },

  deleteSessionExercise: async (sessionExerciseId: number) => {
    if (shouldUseSupabase()) {
      await supabase.from("session_exercise_sets").delete().eq("session_exercise_id", sessionExerciseId);
      return supabase.from("session_exercises").delete().eq("session_exercise_id", sessionExerciseId);
    }
    return localDb.deleteSessionExercise(sessionExerciseId);
  },

  updateSessionExercise: async (sessionExerciseId: number, updates: { notes?: string; exercise_id?: string; exercise_name?: string }) => {
    if (shouldUseSupabase()) {
      return supabase.from("session_exercises").update(updates).eq("session_exercise_id", sessionExerciseId);
    }
    return localDb.updateSessionExercise(sessionExerciseId, updates);
  },

  // Session Exercise Sets
  getSessionExerciseSets: async (sessionExerciseId: number) => {
    return cachedRead(
      shouldUseSupabase(),
      `sessionExerciseSets:${sessionExerciseId}`,
      () => supabase.from("session_exercise_sets")
        .select("*")
        .eq("session_exercise_id", sessionExerciseId)
        .order("set_number"),
      () => localDb.getSessionExerciseSets(sessionExerciseId),
    );
  },

  insertSessionExerciseSet: async (set: { session_exercise_id: number; set_number: number; weight: number | null; reps: number | null; is_warmup: boolean; completed?: boolean; duration_seconds?: number | null; distance_meters?: number | null; pace_sec_per_km?: number | null; calories?: number | null; effort_level?: number | null }) => {
    if (shouldUseSupabase()) {
      return supabase.from("session_exercise_sets").insert(set).select().single();
    }
    return localDb.insertSessionExerciseSet(set);
  },

  updateSessionExerciseSet: async (sessionSetId: number, updates: { reps?: number | null; weight?: number | null; is_warmup?: boolean; completed?: boolean; duration_seconds?: number | null; distance_meters?: number | null; pace_sec_per_km?: number | null; calories?: number | null; effort_level?: number | null }) => {
    if (shouldUseSupabase()) {
      return supabase.from("session_exercise_sets").update(updates).eq("session_set_id", sessionSetId);
    }
    return localDb.updateSessionExerciseSet(sessionSetId, updates);
  },

  deleteSessionExerciseSet: async (sessionSetId: number) => {
    if (shouldUseSupabase()) {
      return supabase.from("session_exercise_sets").delete().eq("session_set_id", sessionSetId);
    }
    return localDb.deleteSessionExerciseSet(sessionSetId);
  },

  // Start from routine (copies template → live session)
  startWorkoutFromRoutine: async (routineId: number, userId: string) => {
    if (shouldUseSupabase()) {
      // Round 1: fetch routine + exercises in parallel
      const [{ data: routine }, { data: exercises }] = await Promise.all([
        supabase.from("routines").select("*").eq("routine_id", routineId).single(),
        supabase.from("routine_exercises").select("*").eq("routine_id", routineId).order("exercise_order"),
      ]);
      if (!routine) return { data: null, error: { message: "Routine not found" } };

      const now = new Date();
      const routineExerciseIds = (exercises ?? []).map((e: any) => e.routine_exercise_id);

      // Round 2: create session + fetch all template sets in parallel
      const [{ data: session, error: sessionErr }, { data: allTemplateSets }] = await Promise.all([
        supabase.from("workout_sessions").insert({
          routine_id: routineId,
          session_name: routine.routine_name,
          session_date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
          start_time: now.toTimeString().split(" ")[0],
          user_id: userId,
        }).select().single(),
        routineExerciseIds.length > 0
          ? supabase.from("routine_exercise_sets").select("*").in("routine_exercise_id", routineExerciseIds).order("set_number")
          : Promise.resolve({ data: [] }),
      ]);
      if (sessionErr) return { data: null, error: sessionErr };

      if ((exercises ?? []).length === 0) return { data: session, error: null };

      // Round 3: batch insert all session exercises at once
      const exerciseInserts = (exercises ?? []).map((ex: any) => ({
        session_id: session.session_id,
        exercise_id: ex.exercise_id,
        exercise_name: ex.exercise_name,
        exercise_order: ex.exercise_order,
        notes: null,
        exercise_type: ex.exercise_type ?? 'strength',
      }));
      const { data: sessionExercises, error: exErr } = await supabase
        .from("session_exercises").insert(exerciseInserts).select();
      if (exErr) return { data: null, error: exErr };

      // Round 4: batch insert all sets at once (sessionExercises preserves insertion order)
      const setInserts: any[] = [];
      (sessionExercises ?? []).forEach((sessionEx: any, i: number) => {
        const origEx = (exercises ?? [])[i];
        const templateSets = (allTemplateSets ?? []).filter(
          (ts: any) => ts.routine_exercise_id === origEx?.routine_exercise_id
        );
        for (const ts of templateSets) {
          setInserts.push({
            session_exercise_id: sessionEx.session_exercise_id,
            set_number: ts.set_number,
            weight: ts.target_weight ?? null,
            reps: ts.target_reps ?? null,
            is_warmup: ts.is_warmup,
            duration_seconds: ts.target_duration_seconds ?? null,
            distance_meters: ts.target_distance_meters ?? null,
            effort_level: ts.target_effort_level ?? null,
          });
        }
      });
      if (setInserts.length > 0) {
        await supabase.from("session_exercise_sets").insert(setInserts);
      }

      await markSessionOrigin(session.session_id, false);
      return { data: session, error: null };
    }
    const result = await localDb.startWorkoutFromRoutine(routineId, userId);
    if (result.data) await markSessionOrigin(result.data.session_id, true);
    return result;
  },

  // Previous performance hints
  getPreviousSessionSets: async (exerciseId: string, userId: string, excludeSessionId: number) => {
    if (shouldUseSupabase()) {
      const { data: prevEx } = await supabase
        .from("session_exercises")
        .select("session_exercise_id, workout_sessions!inner(session_id, user_id, end_time)")
        .eq("exercise_id", exerciseId)
        .eq("workout_sessions.user_id", userId)
        .not("workout_sessions.end_time", "is", null)
        .neq("workout_sessions.session_id", excludeSessionId)
        .order("workout_sessions(created_at)", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!prevEx) return { data: [], error: null };
      return supabase
        .from("session_exercise_sets")
        .select("*")
        .eq("session_exercise_id", prevEx.session_exercise_id)
        .order("set_number");
    }
    return localDb.getPreviousSessionSets(exerciseId, userId, excludeSessionId);
  },

  // Personal Records
  getPersonalRecords: async (userId: string) => {
    return cachedRead(
      shouldUseSupabase(),
      `personalRecords:${userId}`,
      () => supabase.from("personal_records").select("*").eq("user_id", userId),
      () => localDb.getPersonalRecords(userId),
    );
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
    if (shouldUseSupabase()) {
      return supabase.from("personal_records").upsert(
        { pr_type: 'strength', ...record },
        { onConflict: "user_id,exercise_id,pr_type" }
      );
    }
    return localDb.upsertPersonalRecord(record);
  },

  // Custom Exercises
  getCustomExercises: async (userId: string) => {
    return cachedRead(
      shouldUseSupabase(),
      `customExercises:${userId}`,
      () => supabase.from("custom_exercises").select("*").eq("user_id", userId),
      () => localDb.getCustomExercises(userId),
    );
  },

  insertCustomExercise: async (exercise: {
    exercise_id: string;
    user_id: string;
    name: string;
    primary_muscle: string | null;
    equipment: string | null;
    exercise_type?: 'strength' | 'cardio' | 'stretching';
  }) => {
    if (shouldUseSupabase()) {
      return supabase.from("custom_exercises").insert({ exercise_type: 'strength', ...exercise });
    }
    return localDb.insertCustomExercise(exercise);
  },

  deleteCustomExercise: async (exerciseId: string) => {
    if (shouldUseSupabase()) {
      return supabase.from("custom_exercises").delete().eq("exercise_id", exerciseId);
    }
    return localDb.deleteCustomExercise(exerciseId);
  },

  // Batch queries (profile performance — collapse N requests into 1)
  getBatchSessionExercises: async (sessionIds: number[]) => {
    if (sessionIds.length === 0) return { data: [], error: null };
    return cachedRead(
      shouldUseSupabase(),
      `batchSessionExercises:${[...sessionIds].sort((a, b) => a - b).join(",")}`,
      () => supabase.from("session_exercises")
        .select("*")
        .in("session_id", sessionIds)
        .order("exercise_order"),
      async () => {
        const results = await Promise.all(sessionIds.map(id => localDb.getSessionExercises(id)));
        return { data: results.flatMap(r => r.data ?? []), error: null };
      },
    );
  },

  getBatchSessionExerciseSets: async (exerciseIds: number[]) => {
    if (exerciseIds.length === 0) return { data: [], error: null };
    return cachedRead(
      shouldUseSupabase(),
      `batchSessionExerciseSets:${[...exerciseIds].sort((a, b) => a - b).join(",")}`,
      () => supabase.from("session_exercise_sets")
        .select("*")
        .in("session_exercise_id", exerciseIds)
        .order("set_number"),
      async () => {
        const results = await Promise.all(exerciseIds.map(id => localDb.getSessionExerciseSets(id)));
        return { data: results.flatMap(r => r.data ?? []), error: null };
      },
    );
  },

  // Exercise history for progression charts
  getExerciseHistory: async (exerciseId: string, userId: string) => {
    return cachedRead(
      shouldUseSupabase(),
      `exerciseHistory:${exerciseId}:${userId}`,
      async () => {
        const { data: sessionExercises } = await supabase
          .from("session_exercises")
          .select("session_exercise_id, workout_sessions!inner(session_id, session_date, end_time, user_id)")
          .eq("exercise_id", exerciseId)
          .eq("workout_sessions.user_id", userId)
          .not("workout_sessions.end_time", "is", null)
          .order("workout_sessions(session_date)", { ascending: true });

        if (!sessionExercises) return { data: [], error: null };

        const history = await Promise.all(
          sessionExercises.map(async (se: any) => {
            const { data: sets } = await supabase
              .from("session_exercise_sets")
              .select("*")
              .eq("session_exercise_id", se.session_exercise_id)
              .eq("completed", true);
            return {
              session_date: se.workout_sessions.session_date,
              sets: sets ?? [],
            };
          })
        );
        return { data: history, error: null };
      },
      () => localDb.getExerciseHistory(exerciseId, userId),
    );
  },

  // Sync offline-queued sessions to Supabase when reconnected
  syncPendingSessions: async (userId: string): Promise<{ synced: number; errors: number }> => {
    if (!isOnline) return { synced: 0, errors: 0 };
    const queue = await getPendingQueue();
    if (queue.length === 0) return { synced: 0, errors: 0 };

    let synced = 0;
    let errors = 0;
    const successfulIndices: number[] = [];

    for (let i = 0; i < queue.length; i++) {
      const { session, exercises, sets } = queue[i];
      try {
        // Insert session row
        const { data: newSession, error: sessionErr } = await supabase
          .from("workout_sessions")
          .insert({ ...session, user_id: userId })
          .select()
          .single();
        if (sessionErr || !newSession) { errors++; continue; }

        // Insert all exercises in one request, then map local→remote IDs.
        let exIdMap: Record<number, number> = {};
        if (exercises.length > 0) {
          const { data: newExercises, error: exErr } = await supabase
            .from("session_exercises")
            .insert(exercises.map((ex) => ({
              session_id: newSession.session_id,
              exercise_id: ex.exercise_id,
              exercise_name: ex.exercise_name,
              exercise_order: ex.exercise_order,
              notes: ex.notes,
              exercise_type: ex.exercise_type,
            })))
            .select();
          if (exErr || !newExercises) { errors++; continue; }
          exIdMap = buildExerciseIdMap(exercises, newExercises);
        }

        // Insert sets with remapped exercise IDs
        const setsToInsert = remapSetsForInsert(sets, exIdMap);
        if (setsToInsert.length > 0) {
          await supabase.from("session_exercise_sets").insert(setsToInsert);
        }

        successfulIndices.push(i);
        synced++;
      } catch {
        errors++;
      }
    }

    if (successfulIndices.length > 0) await removeFromQueue(successfulIndices);
    return { synced, errors };
  },

  getPendingSessionCount: async (): Promise<number> => getPendingCount(),

  // Cardio aggregate stats
  getCardioStats: async (userId: string) => {
    if (shouldUseSupabase()) {
      // Fetch all cardio session exercises for this user's completed sessions
      const { data: cardioExercises } = await supabase
        .from("session_exercises")
        .select("session_exercise_id, workout_sessions!inner(user_id, end_time)")
        .eq("exercise_type", "cardio")
        .eq("workout_sessions.user_id", userId)
        .not("workout_sessions.end_time", "is", null);

      if (!cardioExercises || cardioExercises.length === 0) {
        return { data: { totalDistanceMeters: 0, totalDurationSeconds: 0, totalCardioSessions: 0, longestRunMeters: 0, fastestPaceSecPerKm: null }, error: null };
      }

      const exerciseIds = cardioExercises.map((e: any) => e.session_exercise_id);
      const { data: sets } = await supabase
        .from("session_exercise_sets")
        .select("*")
        .in("session_exercise_id", exerciseIds)
        .eq("completed", true);

      let totalDistanceMeters = 0;
      let totalDurationSeconds = 0;
      let longestRunMeters = 0;
      let fastestPaceSecPerKm: number | null = null;
      const sessionIds = new Set<number>();

      for (const s of sets ?? []) {
        if (!s.duration_seconds && !s.distance_meters) continue;
        totalDistanceMeters += s.distance_meters ?? 0;
        totalDurationSeconds += s.duration_seconds ?? 0;
        if ((s.distance_meters ?? 0) > longestRunMeters) longestRunMeters = s.distance_meters;
        if (s.pace_sec_per_km && s.pace_sec_per_km > 0) {
          if (fastestPaceSecPerKm === null || s.pace_sec_per_km < fastestPaceSecPerKm) fastestPaceSecPerKm = s.pace_sec_per_km;
        }
      }

      // Count distinct sessions with cardio
      for (const e of cardioExercises) {
        sessionIds.add((e as any).workout_sessions?.session_id);
      }

      return { data: { totalDistanceMeters, totalDurationSeconds, totalCardioSessions: sessionIds.size, longestRunMeters, fastestPaceSecPerKm }, error: null };
    }
    return localDb.getCardioStats(userId);
  },
};