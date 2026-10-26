import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase, isSupabaseConfigured } from "./supabaseClient";
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

export const isOnline = isSupabaseConfigured;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;



// canUseSupabase = Supabase configured AND network available (runtime check)
const canUseSupabase = () => isOnline && networkStatus.isConnected;

export const db = {
  // Auth
  signUp: async (email: string, password: string, username: string) => {
    if (canUseSupabase()) {
      // The public.users profile row is created by a database trigger (handle_new_user,
      // see supabase/migrations) from the username passed here as metadata.
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } },
      });
      if (signUpError) return { data: null, error: signUpError };
      return { data, error: null };
    }
    return localDb.signUp(email, password, username);
  },

  signIn: async (email: string, password: string) => {
    if (canUseSupabase()) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error };
    }
    return localDb.signIn(email, password);
  },

  requestPasswordReset: async (email: string, redirectTo?: string) => {
    if (isOnline) {
      return supabase.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
    }
    return localDb.requestPasswordReset(email);
  },

  signOut: async () => {
    if (canUseSupabase()) {
      await supabase.auth.signOut();
    } else {
      await localDb.signOut();
    }
  },

  getSession: async () => {
    if (canUseSupabase()) {
      return supabase.auth.getSession();
    }
    return localDb.getSession();
  },

  getUser: async () => {
    if (canUseSupabase()) {
      return supabase.auth.getUser();
    }
    return localDb.getUser();
  },

  getUserProfile: async (userId: string) => {
    if (canUseSupabase()) {
      return supabase.from("users").select("*").eq("user_id", userId).single();
    }
    return localDb.getUserProfile(userId);
  },

  updateUserProfile: async (userId: string, updates: { username?: string; bio?: string | null; avatar_url?: string | null }) => {
    if (canUseSupabase()) {
      return supabase.from("users").update(updates).eq("user_id", userId);
    }
    return localDb.updateUserProfile(userId, updates);
  },

  uploadAvatar: async (userId: string, uri: string): Promise<{ url: string | null; error: string | null }> => {
    if (!canUseSupabase()) return { url: null, error: "Requires internet connection" };
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

  changePassword: async (newPassword: string) => {
    if (canUseSupabase()) {
      return supabase.auth.updateUser({ password: newPassword });
    }
    return { data: null, error: { message: "Password changes require an internet connection." } };
  },

  // Permanently deletes the signed-in user's data and login.
  // Needs the delete_my_account() function from supabase/migrations.
  deleteAccount: async (): Promise<{ error: string | null }> => {
    if (!canUseSupabase()) {
      return { error: "Deleting your account requires an internet connection." };
    }
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) return { error: "You're not signed in." };

      // Remove avatar files first (storage objects can't be deleted from SQL).
      const { data: files } = await supabase.storage.from("avatars").list(userId);
      if (files && files.length > 0) {
        await supabase.storage.from("avatars").remove(files.map((f: { name: string }) => `${userId}/${f.name}`));
      }

      const { error } = await supabase.rpc("delete_my_account");
      if (error) return { error: error.message };

      await supabase.auth.signOut();
      await AsyncStorage.clear().catch(() => {});
      return { error: null };
    } catch (e: any) {
      return { error: e?.message ?? "Failed to delete account" };
    }
  },

  onAuthStateChange: (callback: (event: string, session: any) => void) => {
    if (canUseSupabase()) {
      return supabase.auth.onAuthStateChange(callback);
    }
    return localDb.onAuthStateChange(callback);
  },

  // Users
  getUsers: async () => {
    if (canUseSupabase()) {
      return supabase.from("users").select("*");
    }
    return localDb.getUsers();
  },

  // Routines
  getRoutines: async () => {
    if (canUseSupabase()) {
      return supabase.from("routines").select("*");
    }
    return localDb.getRoutines();
  },

  insertRoutine: async (routine: { routine_name: string; description: string | null; user_id: string }) => {
    if (canUseSupabase()) {
      return supabase.from("routines").insert(routine);
    }
    return localDb.insertRoutine(routine);
  },

  updateRoutine: async (routineId: number, updates: { routine_name?: string; description?: string | null; routine_order?: number }) => {
    if (canUseSupabase()) {
      return supabase.from("routines").update(updates).eq("routine_id", routineId);
    }
    return localDb.updateRoutine(routineId, updates);
  },

  deleteRoutine: async (routineId: number) => {
    if (canUseSupabase()) {
      return supabase.from("routines").delete().eq("routine_id", routineId);
    }
    return localDb.deleteRoutine(routineId);
  },

  // Routine Exercises
  getRoutineExercises: async (routineId: number) => {
    if (canUseSupabase()) {
      return supabase
        .from("routine_exercises")
        .select("*")
        .eq("routine_id", routineId)
        .order("exercise_order", { ascending: true });
    }
    return localDb.getRoutineExercises(routineId);
  },

  insertRoutineExercise: async (exercise: {
    routine_id: number;
    exercise_id: string;
    exercise_name: string;
    exercise_order: number;
  }) => {
    if (canUseSupabase()) {
      return supabase.from("routine_exercises").insert(exercise);
    }
    return localDb.insertRoutineExercise(exercise);
  },

  deleteRoutineExercise: async (routineExerciseId: number) => {
    if (canUseSupabase()) {
      return supabase.from("routine_exercises").delete().eq("routine_exercise_id", routineExerciseId);
    }
    return localDb.deleteRoutineExercise(routineExerciseId);
  },

  updateRoutineExercise: async (routineExerciseId: number, updates: { exercise_id?: string; exercise_name?: string }) => {
    if (canUseSupabase()) {
      return supabase.from("routine_exercises").update(updates).eq("routine_exercise_id", routineExerciseId);
    }
    return localDb.updateRoutineExercise(routineExerciseId, updates);
  },

  // Routine Exercise Sets (template sets)
  getRoutineExerciseSets: async (routineExerciseId: number) => {
    if (canUseSupabase()) {
      return supabase
        .from("routine_exercise_sets")
        .select("*")
        .eq("routine_exercise_id", routineExerciseId)
        .order("set_number", { ascending: true });
    }
    return localDb.getRoutineExerciseSets(routineExerciseId);
  },

  insertRoutineExerciseSet: async (set: {
    routine_exercise_id: number;
    set_number: number;
    target_weight: number | null;
    target_reps: number | null;
    is_warmup: boolean;
  }) => {
    if (canUseSupabase()) {
      return supabase.from("routine_exercise_sets").insert(set);
    }
    return localDb.insertRoutineExerciseSet(set);
  },

  deleteRoutineExerciseSet: async (routineSetId: number) => {
    if (canUseSupabase()) {
      return supabase.from("routine_exercise_sets").delete().eq("routine_set_id", routineSetId);
    }
    return localDb.deleteRoutineExerciseSet(routineSetId);
  },

  updateRoutineExerciseSet: async (
    routineSetId: number,
    updates: { target_reps?: number | null; target_weight?: number | null; is_warmup?: boolean }
  ) => {
    if (canUseSupabase()) {
      return supabase
        .from("routine_exercise_sets")
        .update(updates)
        .eq("routine_set_id", routineSetId);
    }
    return localDb.updateRoutineExerciseSet(routineSetId, updates);
  },

  // Workout Sessions
  startWorkoutSession: async (params: { routine_id: number | null; session_name: string; user_id: string }) => {
    if (canUseSupabase()) {
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

  finishWorkoutSession: async (sessionId: number, notes?: string) => {
    if (canUseSupabase()) {
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
          })),
          sets,
        });
      }
    }
    await clearSessionOrigin();
    return result;
  },

  getWorkoutSessions: async (userId: string) => {
    if (canUseSupabase()) {
      return supabase.from("workout_sessions")
        .select("*")
        .eq("user_id", userId)
        .not("end_time", "is", null)
        .order("created_at", { ascending: false });
    }
    return localDb.getWorkoutSessions(userId);
  },

  getWorkoutSession: async (sessionId: number) => {
    if (canUseSupabase()) {
      return supabase.from("workout_sessions")
        .select("*")
        .eq("session_id", sessionId)
        .single();
    }
    return localDb.getWorkoutSession(sessionId);
  },

  getActiveSession: async (userId: string) => {
    if (canUseSupabase()) {
      return supabase.from("workout_sessions")
        .select("*")
        .eq("user_id", userId)
        .is("end_time", null)
        .maybeSingle();
    }
    return localDb.getActiveSession(userId);
  },

  updateWorkoutSession: async (sessionId: number, updates: { notes?: string | null; session_name?: string }) => {
    if (canUseSupabase()) {
      return supabase.from("workout_sessions")
        .update(updates)
        .eq("session_id", sessionId);
    }
    return localDb.updateWorkoutSession(sessionId, updates);
  },

  deleteWorkoutSession: async (sessionId: number) => {
    if (canUseSupabase()) {
      // Delete child records first (Supabase won't cascade unless FK has ON DELETE CASCADE)
      const { data: exercises } = await supabase.from("session_exercises")
        .select("session_exercise_id")
        .eq("session_id", sessionId);
      
      for (const ex of exercises ?? []) {
        await supabase.from("session_exercise_sets")
          .delete()
          .eq("session_exercise_id", ex.session_exercise_id);
      }
      await supabase.from("session_exercises").delete().eq("session_id", sessionId);
      return supabase.from("workout_sessions").delete().eq("session_id", sessionId);
    }
    return localDb.deleteWorkoutSession(sessionId);
  },

  // Session Exercises
  getSessionExercises: async (sessionId: number) => {
    if (canUseSupabase()) {
      return supabase.from("session_exercises")
        .select("*")
        .eq("session_id", sessionId)
        .order("exercise_order");
    }
    return localDb.getSessionExercises(sessionId);
  },

  insertSessionExercise: async (exercise: { session_id: number; exercise_id: string; exercise_name: string; exercise_order: number; notes: string | null }) => {
    if (canUseSupabase()) {
      return supabase.from("session_exercises").insert(exercise).select().single();
    }
    return localDb.insertSessionExercise(exercise);
  },

  deleteSessionExercise: async (sessionExerciseId: number) => {
    if (canUseSupabase()) {
      await supabase.from("session_exercise_sets").delete().eq("session_exercise_id", sessionExerciseId);
      return supabase.from("session_exercises").delete().eq("session_exercise_id", sessionExerciseId);
    }
    return localDb.deleteSessionExercise(sessionExerciseId);
  },

  updateSessionExercise: async (sessionExerciseId: number, updates: { notes?: string; exercise_id?: string; exercise_name?: string }) => {
    if (canUseSupabase()) {
      return supabase.from("session_exercises").update(updates).eq("session_exercise_id", sessionExerciseId);
    }
    return localDb.updateSessionExercise(sessionExerciseId, updates);
  },

  // Session Exercise Sets
  getSessionExerciseSets: async (sessionExerciseId: number) => {
    if (canUseSupabase()) {
      return supabase.from("session_exercise_sets")
        .select("*")
        .eq("session_exercise_id", sessionExerciseId)
        .order("set_number");
    }
    return localDb.getSessionExerciseSets(sessionExerciseId);
  },

  insertSessionExerciseSet: async (set: { session_exercise_id: number; set_number: number; weight: number | null; reps: number | null; is_warmup: boolean; completed?: boolean }) => {
    if (canUseSupabase()) {
      return supabase.from("session_exercise_sets").insert(set).select().single();
    }
    return localDb.insertSessionExerciseSet(set);
  },

  updateSessionExerciseSet: async (sessionSetId: number, updates: { reps?: number | null; weight?: number | null; is_warmup?: boolean; completed?: boolean }) => {
    if (canUseSupabase()) {
      return supabase.from("session_exercise_sets").update(updates).eq("session_set_id", sessionSetId);
    }
    return localDb.updateSessionExerciseSet(sessionSetId, updates);
  },

  deleteSessionExerciseSet: async (sessionSetId: number) => {
    if (canUseSupabase()) {
      return supabase.from("session_exercise_sets").delete().eq("session_set_id", sessionSetId);
    }
    return localDb.deleteSessionExerciseSet(sessionSetId);
  },

  // Start from routine (copies template → live session)
  startWorkoutFromRoutine: async (routineId: number, userId: string) => {
    if (canUseSupabase()) {
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
            weight: ts.target_weight,
            reps: ts.target_reps,
            is_warmup: ts.is_warmup,
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
    if (canUseSupabase()) {
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
    if (canUseSupabase()) {
      return supabase.from("personal_records").select("*").eq("user_id", userId);
    }
    return localDb.getPersonalRecords(userId);
  },

  upsertPersonalRecord: async (record: {
    user_id: string;
    exercise_id: string;
    max_weight: number | null;
    max_volume: number | null;
  }) => {
    if (canUseSupabase()) {
      return supabase.from("personal_records").upsert(record, { onConflict: "user_id,exercise_id" });
    }
    return localDb.upsertPersonalRecord(record);
  },

  // Custom Exercises
  getCustomExercises: async (userId: string) => {
    if (canUseSupabase()) {
      return supabase.from("custom_exercises").select("*").eq("user_id", userId);
    }
    return localDb.getCustomExercises(userId);
  },

  insertCustomExercise: async (exercise: {
    exercise_id: string;
    user_id: string;
    name: string;
    primary_muscle: string | null;
    equipment: string | null;
  }) => {
    if (canUseSupabase()) {
      return supabase.from("custom_exercises").insert(exercise);
    }
    return localDb.insertCustomExercise(exercise);
  },

  deleteCustomExercise: async (exerciseId: string) => {
    if (canUseSupabase()) {
      return supabase.from("custom_exercises").delete().eq("exercise_id", exerciseId);
    }
    return localDb.deleteCustomExercise(exerciseId);
  },

  // Batch queries (profile performance — collapse N requests into 1)
  getBatchSessionExercises: async (sessionIds: number[]) => {
    if (sessionIds.length === 0) return { data: [], error: null };
    if (canUseSupabase()) {
      return supabase.from("session_exercises")
        .select("*")
        .in("session_id", sessionIds)
        .order("exercise_order");
    }
    const results = await Promise.all(sessionIds.map(id => localDb.getSessionExercises(id)));
    return { data: results.flatMap(r => r.data ?? []), error: null };
  },

  getBatchSessionExerciseSets: async (exerciseIds: number[]) => {
    if (exerciseIds.length === 0) return { data: [], error: null };
    if (canUseSupabase()) {
      return supabase.from("session_exercise_sets")
        .select("*")
        .in("session_exercise_id", exerciseIds)
        .order("set_number");
    }
    const results = await Promise.all(exerciseIds.map(id => localDb.getSessionExerciseSets(id)));
    return { data: results.flatMap(r => r.data ?? []), error: null };
  },

  // Exercise history for progression charts
  getExerciseHistory: async (exerciseId: string, userId: string) => {
    if (canUseSupabase()) {
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
    }
    return localDb.getExerciseHistory(exerciseId, userId);
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

        // Insert exercises, building a local→remote ID map
        const exIdMap: Record<number, number> = {};
        for (const ex of exercises) {
          const { data: newEx, error: exErr } = await supabase
            .from("session_exercises")
            .insert({
              session_id: newSession.session_id,
              exercise_id: ex.exercise_id,
              exercise_name: ex.exercise_name,
              exercise_order: ex.exercise_order,
              notes: ex.notes,
            })
            .select()
            .single();
          if (!exErr && newEx) exIdMap[ex.session_exercise_id] = newEx.session_exercise_id;
        }

        // Insert sets with remapped exercise IDs
        const setsToInsert = sets
          .filter(s => exIdMap[s.session_exercise_id] !== undefined)
          .map(s => ({
            session_exercise_id: exIdMap[s.session_exercise_id],
            set_number: s.set_number,
            weight: s.weight,
            reps: s.reps,
            is_warmup: s.is_warmup,
            completed: s.completed,
          }));
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
};