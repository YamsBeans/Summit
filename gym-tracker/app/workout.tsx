import { memo, useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { showAlert } from "@/utils/alert";
import ConfirmModal from "@/components/ConfirmModal";
import ProgressPhotoModal from "@/components/ProgressPhotoModal";
import WorkoutSummaryModal from "@/components/WorkoutSummaryModal";
import PlateCalculatorModal from "@/components/PlateCalculatorModal";
import { useExerciseRest, resolveRest, formatRest, REST_CHOICES } from "@/utils/exerciseRest";
import { buildWorkoutSummary, type SummaryPR, type WorkoutSummary } from "@/utils/workoutSummary";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useActiveWorkout } from "@/utils/ActiveWorkoutContext";
import Ionicons from "@expo/vector-icons/Ionicons";
import { db } from "@/backend/db";
import { useTheme } from "@/theme/ThemeContext";
import { useGuardedPress } from "@/utils/pressGuard";
import ExercisePicker from "@/components/ExercisePicker";
import RestTimerBanner from "@/components/RestTimerBanner";
import { useRestTimer } from "@/utils/useRestTimer";
import { detectPRs, detectCardioPRs, mergeStrengthRecord } from "@/utils/prDetection";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { scheduleRestDoneNotification, cancelRestDoneNotification } from "@/utils/notifications";
import { useUnits, useDistanceUnit, formatVolume } from "@/utils/units";
import { logError } from "@/utils/log";
import { formatNumberInput, parseDecimalInput, parseIntInput } from "@/utils/numberInput";
import { notifySuccess, tapLight } from "@/utils/haptics";
import CardioSetRow from "@/components/CardioSetRow";
import { formatDistance, formatDurationShort } from "@/utils/cardioUtils";

export default function WorkoutScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const scrollRef = useRef<ScrollView>(null);
  const { colors } = useTheme();
  const { minimizeWorkout, clearActiveWorkout } = useActiveWorkout();
  const { toDisplay, label: unitLabel } = useUnits();
  const { distanceUnit } = useDistanceUnit();
  const { sessionId: sessionIdParam } = useLocalSearchParams<{ sessionId: string }>();

  const [session, setSession] = useState<any>(null);
  const [exercises, setExercises] = useState<any[]>([]);
  const [exerciseSets, setExerciseSets] = useState<Record<number, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const startTimestamp = useRef<number>(Date.now());

  const isMinimizingRef = useRef(false);

  const handleMinimize = useCallback(() => {
    if (!session) return;
    minimizeWorkout(session.session_id, session.session_name, startTimestamp.current);
    isMinimizingRef.current = true;
    router.back();
  }, [session, minimizeWorkout, router]);

  // Intercept back swipe — minimize instead of popping
  useEffect(() => {
    const unsub = navigation.addListener("beforeRemove" as any, (e: any) => {
      if (!session || session.end_time) return;
      // Let our own router.back() (from handleMinimize) pass through
      if (isMinimizingRef.current) {
        isMinimizingRef.current = false;
        return;
      }
      e.preventDefault();
      handleMinimize();
    });
    return unsub;
  }, [navigation, session, handleMinimize]);

  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const finishedSessionId = useRef<number | null>(null);
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [plateWeight, setPlateWeight] = useState<number | null | undefined>(undefined);
  const [setOptionsVisible, setSetOptionsVisible] = useState(false);
  const [selectedSet, setSelectedSet] = useState<any>(null);
  const [selectedExerciseId, setSelectedExerciseId] = useState<number | null>(null);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [prevSets, setPrevSets] = useState<Record<string, any[]>>({});
  const [exerciseOptionsVisible, setExerciseOptionsVisible] = useState(false);
  const [selectedExerciseForOptions, setSelectedExerciseForOptions] = useState<any>(null);
  const exercisePickerModeRef = useRef<"add" | "replace">("add");
  const replaceTargetRef = useRef<any>(null);

  const restTimer = useRestTimer();
  // Pull out the stable callbacks: the restTimer object itself changes every
  // second, and depending on it would re-render every memoized set row on
  // each tick of the countdown.
  const { start: startRest, skip: skipRest, addTime: addRestTime, setOnComplete: setRestOnComplete, duration: restDuration } = restTimer;
  const restRemainingRef = useRef(0);
  restRemainingRef.current = restTimer.remaining;

  // Per-exercise rest overrides (Hevy-style). Read through refs so the
  // callback handed to every set row stays stable.
  const { restOverrides, setRestFor } = useExerciseRest();
  const restOverridesRef = useRef(restOverrides);
  restOverridesRef.current = restOverrides;
  const exercisesRef = useRef<any[]>([]);
  exercisesRef.current = exercises;
  const [restPickerFor, setRestPickerFor] = useState<any>(null);

  const startRestTimer = useCallback((sessionExerciseId?: number) => {
    const ex = exercisesRef.current.find((e) => e.session_exercise_id === sessionExerciseId);
    const secs = resolveRest(restOverridesRef.current, ex?.exercise_id, restDuration);
    if (secs <= 0) return; // rest timer turned off for this exercise
    startRest(secs);
    AsyncStorage.getItem("@gym_tracker_notifications").then((val) => {
      if (val === "true") scheduleRestDoneNotification(secs);
    });
  }, [startRest, restDuration]);

  const skipRestTimer = useCallback(() => {
    skipRest();
    cancelRestDoneNotification();
  }, [skipRest]);

  // Keep the scheduled "rest complete" notification in sync when the user
  // adjusts the timer — otherwise it still fires at the original end time.
  const handleAddRestTime = useCallback((secs: number) => {
    const next = restRemainingRef.current + secs;
    addRestTime(secs);
    if (next <= 0) { cancelRestDoneNotification(); return; }
    AsyncStorage.getItem("@gym_tracker_notifications").then((val) => {
      if (val === "true") scheduleRestDoneNotification(next);
    });
  }, [addRestTime]);

  // Buzz when rest is over while the app is open (the notification covers
  // the backgrounded case).
  useEffect(() => {
    setRestOnComplete(() => notifySuccess());
  }, [setRestOnComplete]);

  const totalVolume = useMemo(() => {
    let total = 0;
    for (const sets of Object.values(exerciseSets)) {
      for (const set of sets) {
        if (set.completed && set.weight != null && set.reps != null) {
          total += set.weight * set.reps;
        }
      }
    }
    return total;
  }, [exerciseSets]);

  const { totalCardioDistanceMeters, totalCardioDurationSeconds } = useMemo(() => {
    let dist = 0;
    let dur = 0;
    for (const sets of Object.values(exerciseSets)) {
      for (const set of sets) {
        if (set.completed) {
          dist += set.distance_meters ?? 0;
          dur += set.duration_seconds ?? 0;
        }
      }
    }
    return { totalCardioDistanceMeters: dist, totalCardioDurationSeconds: dur };
  }, [exerciseSets]);


  const completedSetsCount = useMemo(() =>
    Object.values(exerciseSets).flat().filter((s) => s.completed).length,
    [exerciseSets]
  );

  // Derive real start time from DB fields so the timer survives remounts
  const sessionStartTs = useMemo(() => {
    if (!session) return null;
    const ts = new Date(session.session_date + "T" + session.start_time).getTime();
    return Number.isFinite(ts) ? ts : null;
  }, [session]);
  useEffect(() => {
    if (sessionStartTs != null) startTimestamp.current = sessionStartTs;
  }, [sessionStartTs]);

  const loadSession = async () => {
    setLoading(true);
    const sessionId = parseInt(sessionIdParam, 10);

    // Fetch session, exercises, and current user all in parallel
    const [sessionResult, exercisesResult, userResult] = await Promise.all([
      db.getWorkoutSession(sessionId),
      db.getSessionExercises(sessionId),
      db.getUser(),
    ]);

    if (sessionResult.data) {
      setSession(sessionResult.data);
      setNotes(sessionResult.data.notes ?? "");
      // Register in context so the bar is visible even while inside the workout screen
      if (!sessionResult.data.end_time) {
        const ts = new Date(
          sessionResult.data.session_date + "T" + sessionResult.data.start_time
        ).getTime();
        minimizeWorkout(sessionResult.data.session_id, sessionResult.data.session_name, ts);
      }
    }

    const exs = exercisesResult.data ?? [];
    setExercises(exs);

    const userId = userResult.data?.user?.id;

    // Fetch all sets and all previous sets in parallel
    const [setsResults, prevResults] = await Promise.all([
      Promise.all(exs.map((ex: any) => db.getSessionExerciseSets(ex.session_exercise_id))),
      userId && sessionResult.data
        ? Promise.all(exs.map((ex: any) =>
            db.getPreviousSessionSets(ex.exercise_id, userId, sessionResult.data!.session_id)
          ))
        : Promise.resolve([]),
    ]);

    const setsMap: Record<number, any[]> = {};
    exs.forEach((ex: any, i: number) => {
      setsMap[ex.session_exercise_id] = setsResults[i].data ?? [];
    });
    setExerciseSets(setsMap);

    const prevMap: Record<string, any[]> = {};
    exs.forEach((ex: any, i: number) => {
      prevMap[ex.exercise_id] = (prevResults[i] as any)?.data ?? [];
    });
    setPrevSets(prevMap);

    setLoading(false);
  };

  // Exercises added (or swapped in) mid-workout need last session's numbers
  // too — before, only exercises present when the screen opened got them, so a
  // quick-start workout never showed a "previous" column.
  const loadPrevSetsFor = useCallback(async (exerciseId: string): Promise<any[]> => {
    if (!session) return [];
    try {
      const { data: userData } = await db.getUser();
      const userId = userData?.user?.id;
      if (!userId) return [];
      const { data } = await db.getPreviousSessionSets(exerciseId, userId, session.session_id);
      setPrevSets((prev) => ({ ...prev, [exerciseId]: data ?? [] }));
      return data ?? [];
    } catch (e) { logError("workout.loadPrevSetsFor", e); return []; }
  }, [session]);

  const reloadSetsForExercise = async (sessionExerciseId: number) => {
    const { data } = await db.getSessionExerciseSets(sessionExerciseId);
    setExerciseSets((prev) => ({ ...prev, [sessionExerciseId]: data ?? [] }));
  };

  const updateSet = useCallback(async (
    sessionSetId: number,
    sessionExerciseId: number,
    updates: { reps?: number | null; weight?: number | null; is_warmup?: boolean; completed?: boolean }
  ) => {
    setExerciseSets((prev) => {
      const sets = prev[sessionExerciseId] ?? [];
      return {
        ...prev,
        [sessionExerciseId]: sets.map((s) =>
          s.session_set_id === sessionSetId ? { ...s, ...updates } : s
        ),
      };
    });

    const { error } = await db.updateSessionExerciseSet(sessionSetId, updates);
    if (error) {
      setError(error.message);
      reloadSetsForExercise(sessionExerciseId);
    }
  }, []);

  const addSet = useGuardedPress(async (sessionExerciseId: number) => {
    const currentSets = exerciseSets[sessionExerciseId] ?? [];
    setError(null);

    let prefillWeight: number | null = null;
    let prefillReps: number | null = null;

    for (let i = currentSets.length - 1; i >= 0; i--) {
      const s = currentSets[i];
      if (s.weight != null || s.reps != null) {
        prefillWeight = s.weight ?? null;
        prefillReps = s.reps ?? null;
        break;
      }
    }

    const { error } = await db.insertSessionExerciseSet({
      session_exercise_id: sessionExerciseId,
      set_number: currentSets.length + 1,
      weight: prefillWeight,
      reps: prefillReps,
      is_warmup: false,
    });
    if (error) setError(error.message);
    else reloadSetsForExercise(sessionExerciseId);
  }, 300);

  const deleteSet = async (sessionSetId: number, sessionExerciseId: number) => {
    setExerciseSets((prev) => ({
      ...prev,
      [sessionExerciseId]: (prev[sessionExerciseId] ?? []).filter(
        (s) => s.session_set_id !== sessionSetId
      ),
    }));

    const { error } = await db.deleteSessionExerciseSet(sessionSetId);
    if (error) {
      setError(error.message);
      reloadSetsForExercise(sessionExerciseId);
    }
  };

  const openSetOptions = useCallback((set: any, sessionExerciseId: number) => {
    setSelectedSet(set);
    setSelectedExerciseId(sessionExerciseId);
    setSetOptionsVisible(true);
  }, []);

  const closeSetOptions = useCallback(() => {
    setSetOptionsVisible(false);
    setSelectedSet(null);
    setSelectedExerciseId(null);
  }, []);

  const handleToggleWarmup = useGuardedPress(async () => {
    if (!selectedSet || !selectedExerciseId) return;
    await updateSet(selectedSet.session_set_id, selectedExerciseId, {
      is_warmup: !selectedSet.is_warmup,
    });
    closeSetOptions();
  });

  const handleRemoveSet = useGuardedPress(async () => {
    if (!selectedSet || !selectedExerciseId) return;
    await deleteSet(selectedSet.session_set_id, selectedExerciseId);
    closeSetOptions();
  });

  const [finishPrompt, setFinishPrompt] = useState<{ title: string; message: string } | null>(null);

  // Ask before finishing when the log looks unfinished, like Strong/Hevy do —
  // a stray tap on "Finish" shouldn't end a workout halfway through.
  const requestFinish = useGuardedPress(() => {
    if (!session) return;
    const allSets = Object.values(exerciseSets).flat();
    const incomplete = allSets.filter((s: any) => !s.completed).length;
    if (allSets.length === 0 || completedSetsCount === 0) {
      setFinishPrompt({
        title: "Finish Workout?",
        message: "You haven't completed any sets yet. Finish and save this workout anyway?",
      });
    } else if (incomplete > 0) {
      setFinishPrompt({
        title: "Finish Workout?",
        message: `You have ${incomplete} unfinished set${incomplete === 1 ? "" : "s"}. Only completed sets count toward your stats and PRs.`,
      });
    } else {
      finishWorkout();
    }
  }, 500);

  const finishWorkout = useGuardedPress(async () => {
    if (!session) return;
    setFinishPrompt(null);
    setError(null);
    const { error } = await db.finishWorkoutSession(session.session_id, notes || null);
    if (error) { setError(error.message); return; }

    // Sync completed set values back to the routine template so it reflects what was done
    if (session.routine_id) {
      try {
        await db.syncSessionSetsToRoutine(session.session_id, session.routine_id);
      } catch (e) { logError("finishWorkout.syncSessionSetsToRoutine", e); }
    }

    // Mark local session as ended so the beforeRemove listener doesn't intercept router.back()
    setSession((prev: any) => ({ ...prev, end_time: new Date().toISOString() }));
    skipRest();
    cancelRestDoneNotification();
    clearActiveWorkout();
    finishedSessionId.current = session.session_id;
    const durationSeconds = (Date.now() - startTimestamp.current) / 1000;
    const summaryPRs: SummaryPR[] = [];

    try {
      const { data: userData } = await db.getUser();
      const userId = userData?.user?.id;
      if (userId) {
        const { data: existingPRs } = await db.getPersonalRecords(userId);

        // Strength PRs
        const strengthExercises = exercises.filter((e: any) => e.exercise_type !== 'cardio');
        const prs = detectPRs(strengthExercises, exerciseSets, existingPRs ?? []);
        for (const pr of prs) {
          const sets = exerciseSets[exercises.find((e: any) => e.exercise_id === pr.exerciseId)?.session_exercise_id] ?? [];
          const prev = (existingPRs ?? []).find((r: any) => r.exercise_id === pr.exerciseId && r.pr_type !== 'cardio');
          const merged = mergeStrengthRecord(sets, prev);
          await db.upsertPersonalRecord({ user_id: userId, exercise_id: pr.exerciseId, ...merged, pr_type: 'strength' });
        }

        // Cardio PRs
        const cardioExercises = exercises.filter((e: any) => e.exercise_type === 'cardio');
        for (const ex of cardioExercises) {
          const sets = (exerciseSets[ex.session_exercise_id] ?? []);
          const existingPR = (existingPRs ?? []).find((r: any) => r.exercise_id === ex.exercise_id && r.pr_type === 'cardio') ?? null;
          const cardioPR = detectCardioPRs(ex, sets, existingPR);
          if (cardioPR) {
            await db.upsertPersonalRecord({
              user_id: userId,
              exercise_id: ex.exercise_id,
              max_weight: null,
              max_volume: null,
              pr_type: 'cardio',
              // Only the improved fields are set on cardioPR; keep the rest.
              best_distance_meters: cardioPR.bestDistanceMeters ?? existingPR?.best_distance_meters ?? null,
              best_pace_sec_per_km: cardioPR.bestPaceSecPerKm ?? existingPR?.best_pace_sec_per_km ?? null,
              best_duration_seconds: cardioPR.bestDurationSeconds ?? existingPR?.best_duration_seconds ?? null,
            });
            const label = cardioPR.bestDistanceMeters ? "Distance"
              : cardioPR.bestPaceSecPerKm ? "Pace"
              : "Duration";
            summaryPRs.push({ exerciseId: ex.exercise_id, label });
          }
        }

        for (const p of prs) {
          summaryPRs.push({
            exerciseId: p.exerciseId,
            label: p.type === "both" ? "Weight & Volume" : p.type === "weight" ? "Weight" : "Volume",
          });
        }
      }
    } catch (e) { logError("finishWorkout.prDetection", e); }
    if (summaryPRs.length > 0) notifySuccess();
    // iOS won't present the summary while the "Finish Workout?" dialog is
    // still fading out, and the summary is the only way off this screen.
    if (Platform.OS === "ios") await new Promise((r) => setTimeout(r, 400));
    setSummary(buildWorkoutSummary(exercises, exerciseSets, summaryPRs, durationSeconds));
  }, 1000);

  const handleSummaryAddPhoto = useCallback(() => {
    setSummary(null);
    // iOS can't present a second modal while the first is still animating out.
    setTimeout(() => setShowPhotoModal(true), Platform.OS === "ios" ? 400 : 0);
  }, []);

  const handleSummaryDone = useCallback(() => {
    setSummary(null);
    router.back();
  }, [router]);

  const handleProgressPhoto = useCallback(async (uri: string) => {
    const sessionId = finishedSessionId.current;
    if (!sessionId) { setShowPhotoModal(false); router.back(); return; }
    setPhotoUploading(true);
    try {
      const { data: userData } = await db.getUser();
      const userId = userData?.user?.id;
      if (userId) {
        const { url, error: uploadError } = await db.uploadProgressPhoto(userId, sessionId, uri);
        if (uploadError) {
          setPhotoUploading(false);
          setShowPhotoModal(false);
          showAlert("Photo Upload Failed", uploadError, [{ text: "OK", onPress: () => router.back() }]);
          return;
        }
        if (url) {
          const { error: saveError } = await db.updateSessionPhotoUrl(sessionId, url) as any;
          if (saveError) {
            setPhotoUploading(false);
            setShowPhotoModal(false);
            showAlert("Photo Save Failed", saveError.message ?? "Could not link photo to workout.", [{ text: "OK", onPress: () => router.back() }]);
            return;
          }
        }
      } else {
        // Offline or unauthenticated — store local URI so it's still visible
        await db.updateSessionPhotoUrl(sessionId, uri);
      }
    } catch (e) { logError("handleProgressPhoto", e); }
    setPhotoUploading(false);
    setShowPhotoModal(false);
    router.back();
  }, [router]);

  const discardWorkout = useGuardedPress(() => {
    if (!session) return;
    setShowDiscardModal(true);
  }, 500);

  const handleConfirmDiscard = useCallback(async () => {
    if (!session) return;
    setShowDiscardModal(false);
    skipRest();
    cancelRestDoneNotification();
    clearActiveWorkout();
    isMinimizingRef.current = true;
    await db.deleteWorkoutSession(session.session_id);
    router.back();
  }, [session, clearActiveWorkout, router, skipRest]);

  const openExerciseOptions = useCallback((ex: any) => {
    setSelectedExerciseForOptions(ex);
    setExerciseOptionsVisible(true);
  }, []);

  const closeExerciseOptions = useCallback(() => {
    setExerciseOptionsVisible(false);
    setSelectedExerciseForOptions(null);
  }, []);

  const handleRemoveExercise = useGuardedPress(async () => {
    if (!selectedExerciseForOptions) return;
    const { error } = await db.deleteSessionExercise(selectedExerciseForOptions.session_exercise_id);
    if (error) { setError(error.message); closeExerciseOptions(); return; }
    setExercises((prev) => prev.filter((e) => e.session_exercise_id !== selectedExerciseForOptions.session_exercise_id));
    setExerciseSets((prev) => {
      const next = { ...prev };
      delete next[selectedExerciseForOptions.session_exercise_id];
      return next;
    });
    closeExerciseOptions();
  });

  const handleReplaceExercise = useGuardedPress(async (exercise: any) => {
    const target = replaceTargetRef.current;
    if (!target) return;
    setShowAddExercise(false);
    const { error } = await db.updateSessionExercise(target.session_exercise_id, {
      exercise_id: exercise.id,
      exercise_name: exercise.name,
    });
    if (error) { setError(error.message); replaceTargetRef.current = null; return; }
    setExercises((prev) => prev.map((e) =>
      e.session_exercise_id === target.session_exercise_id
        ? { ...e, exercise_id: exercise.id, exercise_name: exercise.name }
        : e
    ));
    replaceTargetRef.current = null;
    if (!prevSets[exercise.id]) loadPrevSetsFor(exercise.id);
  });

  const handleAddExercise = useGuardedPress(async (exercise: any) => {
    if (!session) return;
    setShowAddExercise(false);
    const exType = exercise.exercise_type ?? (exercise.category === 'cardio' ? 'cardio' : exercise.category === 'stretching' ? 'stretching' : 'strength');
    const { data: newEx, error } = await db.insertSessionExercise({
      session_id: session.session_id,
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      exercise_order: exercises.length === 0 ? 1 : Math.max(...exercises.map((e) => e.exercise_order)) + 1,
      notes: null,
      exercise_type: exType,
    });
    if (error) { setError(error.message); return; }
    setExercises((prev) => [...prev, newEx]);
    setExerciseSets((prev) => ({ ...prev, [newEx.session_exercise_id]: [] }));
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    // Start the exercise with ready-to-log rows, like Strong/Hevy: as many
    // sets as last time (warmups kept), or one if it's new. Values stay empty
    // so last session's numbers show as placeholders / tap-to-fill.
    const prev = prevSets[exercise.id] ?? await loadPrevSetsFor(exercise.id);
    const template = prev.length > 0 ? prev.slice(0, 10) : [{ is_warmup: false }];
    // In parallel, so a slow connection doesn't hold the press guard (and
    // swallow the next "Add Exercise" tap) for one round trip per set.
    const results = await Promise.all(template.map((t: any, i: number) =>
      db.insertSessionExerciseSet({
        session_exercise_id: newEx.session_exercise_id,
        set_number: i + 1,
        weight: null,
        reps: null,
        is_warmup: t.is_warmup === true,
      })
    ));
    const setErr = results.find((r: any) => r.error)?.error;
    if (setErr) setError(setErr.message);
    reloadSetsForExercise(newEx.session_exercise_id);
  });

  useEffect(() => { loadSession(); }, []);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.textSecondary, marginTop: 10, fontSize: 14 }}>Loading workout…</Text>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Session not found</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: colors.primary, fontWeight: "600" }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const volumeDisplay = formatVolume(toDisplay(totalVolume));

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* ── Sticky header ── */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Pressable onPress={handleMinimize} hitSlop={8} style={styles.headerBack} accessibilityRole="button" accessibilityLabel="Minimize workout">
          <Ionicons name="chevron-down" size={22} color={colors.textSecondary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {session.session_name}
        </Text>
        <View style={styles.headerRight}>
          <Pressable style={[styles.finishPill, { backgroundColor: colors.primary }]} onPress={requestFinish} accessibilityRole="button" accessibilityLabel="Finish workout">
            <Text style={styles.finishPillText}>Finish</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Stats bar ── */}
      <View style={[styles.statsBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.statItem}>
          <ElapsedTime startTs={sessionStartTs} running={!session.end_time} style={[styles.statValue, { color: colors.primary }]} />
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Duration</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        {totalVolume > 0 && (
          <>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.text }]}>{volumeDisplay} {unitLabel}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Volume</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          </>
        )}
        {totalCardioDistanceMeters > 0 && (
          <>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.text }]}>
                {formatDistance(totalCardioDistanceMeters, distanceUnit)}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Distance</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          </>
        )}
        {totalCardioDurationSeconds > 0 && totalCardioDistanceMeters === 0 && (
          <>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.text }]}>{formatDurationShort(totalCardioDurationSeconds)}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Cardio</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          </>
        )}
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.text }]}>{completedSetsCount}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Sets</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={true}
      >
        {error && (
          <View style={[styles.errorBanner, { backgroundColor: colors.dangerLight }]}>
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
          </View>
        )}

        {exercises.map((ex) => {
          const sets = exerciseSets[ex.session_exercise_id] ?? [];
          return (
            <View key={ex.session_exercise_id} style={[styles.exerciseCard, { backgroundColor: colors.surface }]}>
              {/* Exercise name — blue, tappable */}
              <View style={styles.exerciseHeaderRow}>
                <Pressable
                  style={styles.exerciseNameBtn}
                  onPress={() => router.push({
                    pathname: "/exercise-detail/[exerciseId]",
                    params: { exerciseId: ex.exercise_id, exerciseName: ex.exercise_name, exerciseType: ex.exercise_type ?? "" },
                  })}
                >
                  <Text style={[styles.exerciseName, { color: colors.primary }]}>
                    {ex.exercise_name}
                  </Text>
                </Pressable>
                {restOverrides[ex.exercise_id] != null && (
                  <Pressable
                    onPress={() => setRestPickerFor(ex)}
                    hitSlop={6}
                    style={[styles.restPill, { backgroundColor: colors.surfaceSecondary }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Rest timer ${formatRest(restOverrides[ex.exercise_id])}. Change`}
                  >
                    <Ionicons name="timer-outline" size={13} color={colors.textSecondary} />
                    <Text style={[styles.restPillText, { color: colors.textSecondary }]}>{formatRest(restOverrides[ex.exercise_id])}</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => openExerciseOptions(ex)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${ex.exercise_name} options`}>
                  <Ionicons name="ellipsis-horizontal" size={20} color={colors.textTertiary} />
                </Pressable>
              </View>

              {/* Column headers — vary by exercise type */}
              {ex.exercise_type === 'cardio' ? (
                <View style={[styles.colHeaders, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.colHeader, styles.colSet, { color: colors.textTertiary }]}>SET</Text>
                  <Text style={[styles.colHeader, styles.colPrev, { color: colors.textTertiary }]}>PREVIOUS</Text>
                  <Text style={[styles.colHeader, styles.colVal, { color: colors.textTertiary }]}>DIST ({distanceUnit})</Text>
                  <Text style={[styles.colHeader, styles.colVal, { color: colors.textTertiary }]}>DURATION</Text>
                  <View style={styles.colCheck} />
                </View>
              ) : (
                <View style={[styles.colHeaders, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.colHeader, styles.colSet, { color: colors.textTertiary }]}>SET</Text>
                  <Text style={[styles.colHeader, styles.colPrev, { color: colors.textTertiary }]}>PREVIOUS</Text>
                  <Text style={[styles.colHeader, styles.colVal, { color: colors.textTertiary }]}>{unitLabel.toUpperCase()}</Text>
                  <Text style={[styles.colHeader, styles.colVal, { color: colors.textTertiary }]}>REPS</Text>
                  <View style={styles.colCheck} />
                </View>
              )}

              {/* Set rows — cardio or strength */}
              {sets.map((set, idx) => (
                ex.exercise_type === 'cardio' ? (
                  <CardioSetRow
                    key={set.session_set_id}
                    set={set}
                    sessionExerciseId={ex.session_exercise_id}
                    onUpdate={updateSet}
                    onSetNumberPress={openSetOptions}
                    prevSet={prevSets[ex.exercise_id]?.[idx]}
                    onComplete={startRestTimer}
                    distanceUnit={distanceUnit}
                  />
                ) : (
                  <SetRow
                    key={set.session_set_id}
                    set={set}
                    sessionExerciseId={ex.session_exercise_id}
                    onUpdate={updateSet}
                    onSetNumberPress={openSetOptions}
                    prevSet={prevSets[ex.exercise_id]?.[idx]}
                    onComplete={startRestTimer}
                  />
                )
              ))}

              {/* + Add Set — full-width dark button */}
              <Pressable
                style={[styles.addSetBtn, { backgroundColor: colors.surfaceSecondary }]}
                onPress={() => addSet(ex.session_exercise_id)}
              >
                <Ionicons name="add" size={18} color={colors.textSecondary} />
                <Text style={[styles.addSetText, { color: colors.textSecondary }]}>Add Set</Text>
              </Pressable>
            </View>
          );
        })}

        {/* Add Exercise */}
        <Pressable
          style={[styles.addExerciseBtn, { backgroundColor: colors.surface }]}
          onPress={() => setShowAddExercise(true)}
        >
          <Ionicons name="add" size={20} color={colors.primary} />
          <Text style={[styles.addExerciseText, { color: colors.primary }]}>Add Exercise</Text>
        </Pressable>

        {/* Notes */}
        <TextInput
          style={[styles.notesInput, {
            backgroundColor: colors.surface,
            color: notes ? colors.text : colors.textTertiary,
          }]}
          placeholder="Add notes…"
          placeholderTextColor={colors.textTertiary}
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        {/* Discard */}
        <Pressable style={styles.discardBtn} onPress={discardWorkout}>
          <Text style={[styles.discardText, { color: colors.danger }]}>Discard Workout</Text>
        </Pressable>
      </ScrollView>

      <RestTimerBanner
        remaining={restTimer.remaining}
        total={restTimer.total}
        onSkip={skipRestTimer}
        onAddTime={handleAddRestTime}
      />

      <ExercisePicker
        visible={showAddExercise}
        onSelect={(exercise) => {
          if (exercisePickerModeRef.current === "replace") {
            exercisePickerModeRef.current = "add";
            handleReplaceExercise(exercise);
          } else {
            handleAddExercise(exercise);
          }
        }}
        onClose={() => {
          exercisePickerModeRef.current = "add";
          replaceTargetRef.current = null;
          setShowAddExercise(false);
        }}
      />

      {/* Set options bottom sheet */}
      <Modal visible={setOptionsVisible} transparent animationType="slide" onRequestClose={closeSetOptions}>
        <Pressable style={modalStyles.overlay} onPress={closeSetOptions}>
          <View style={[modalStyles.sheet, { backgroundColor: colors.surface }]}>
            <View style={[modalStyles.handle, { backgroundColor: colors.border }]} />
            <Text style={[modalStyles.sheetTitle, { color: colors.textSecondary }]}>
              Set {selectedSet?.set_number}
            </Text>

            <Pressable style={[modalStyles.option, { borderBottomColor: colors.border }]} onPress={handleToggleWarmup}>
              <View style={[modalStyles.iconWrap, { backgroundColor: colors.warningLight }]}>
                <Text style={{ fontSize: 16 }}>🔥</Text>
              </View>
              <Text style={[modalStyles.optionLabel, { color: colors.text }]}>
                {selectedSet?.is_warmup ? "Remove Warmup" : "Mark as Warmup"}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </Pressable>

            {exercises.find((e) => e.session_exercise_id === selectedExerciseId)?.exercise_type !== "cardio" && (
              <Pressable
                style={[modalStyles.option, { borderBottomColor: colors.border }]}
                onPress={() => {
                  const ex = exercises.find((e) => e.session_exercise_id === selectedExerciseId);
                  const idx = (exerciseSets[selectedExerciseId ?? -1] ?? []).findIndex((s) => s.session_set_id === selectedSet?.session_set_id);
                  const prev = ex ? prevSets[ex.exercise_id]?.[idx] : null;
                  const w = toDisplay(selectedSet?.weight ?? prev?.weight ?? null);
                  closeSetOptions();
                  setTimeout(() => setPlateWeight(w), Platform.OS === "ios" ? 400 : 0);
                }}
              >
                <View style={[modalStyles.iconWrap, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name="barbell-outline" size={16} color={colors.primary} />
                </View>
                <Text style={[modalStyles.optionLabel, { color: colors.text }]}>Plate Calculator</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </Pressable>
            )}

            <Pressable style={modalStyles.option} onPress={handleRemoveSet}>
              <View style={[modalStyles.iconWrap, { backgroundColor: colors.dangerLight }]}>
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
              </View>
              <Text style={[modalStyles.optionLabel, { color: colors.danger }]}>Remove Set</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.danger} style={{ opacity: 0.4 }} />
            </Pressable>

            <Pressable
              style={[modalStyles.cancelBtn, { backgroundColor: colors.surfaceSecondary }]}
              onPress={closeSetOptions}
            >
              <Text style={[modalStyles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Exercise options bottom sheet */}
      <Modal visible={exerciseOptionsVisible} transparent animationType="slide" onRequestClose={closeExerciseOptions}>
        <Pressable style={modalStyles.overlay} onPress={closeExerciseOptions}>
          <View style={[modalStyles.sheet, { backgroundColor: colors.surface }]}>
            <View style={[modalStyles.handle, { backgroundColor: colors.border }]} />
            <Text style={[modalStyles.sheetTitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {selectedExerciseForOptions?.exercise_name}
            </Text>
            <Pressable
              style={[modalStyles.option, { borderBottomColor: colors.border }]}
              onPress={() => {
                exercisePickerModeRef.current = "replace";
                replaceTargetRef.current = selectedExerciseForOptions;
                closeExerciseOptions();
                setShowAddExercise(true);
              }}
            >
              <View style={[modalStyles.iconWrap, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="swap-horizontal-outline" size={16} color={colors.primary} />
              </View>
              <Text style={[modalStyles.optionLabel, { color: colors.text }]}>Replace Exercise</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </Pressable>
            <Pressable
              style={[modalStyles.option, { borderBottomColor: colors.border }]}
              onPress={() => {
                const ex = selectedExerciseForOptions;
                closeExerciseOptions();
                // Let the options sheet close before opening the next one (iOS).
                setTimeout(() => setRestPickerFor(ex), Platform.OS === "ios" ? 400 : 0);
              }}
            >
              <View style={[modalStyles.iconWrap, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="timer-outline" size={16} color={colors.primary} />
              </View>
              <Text style={[modalStyles.optionLabel, { color: colors.text }]}>Rest Timer</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "600" }}>
                {formatRest(resolveRest(restOverrides, selectedExerciseForOptions?.exercise_id, restDuration))}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </Pressable>
            <Pressable style={modalStyles.option} onPress={handleRemoveExercise}>
              <View style={[modalStyles.iconWrap, { backgroundColor: colors.dangerLight }]}>
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
              </View>
              <Text style={[modalStyles.optionLabel, { color: colors.danger }]}>Remove Exercise</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.danger} style={{ opacity: 0.4 }} />
            </Pressable>
            <Pressable
              style={[modalStyles.cancelBtn, { backgroundColor: colors.surfaceSecondary }]}
              onPress={closeExerciseOptions}
            >
              <Text style={[modalStyles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <PlateCalculatorModal
        visible={plateWeight !== undefined}
        initialWeight={plateWeight ?? null}
        onClose={() => setPlateWeight(undefined)}
      />

      {/* Per-exercise rest timer picker */}
      <Modal visible={restPickerFor != null} transparent animationType="slide" onRequestClose={() => setRestPickerFor(null)}>
        <Pressable style={modalStyles.overlay} onPress={() => setRestPickerFor(null)}>
          <Pressable style={[modalStyles.sheet, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <View style={[modalStyles.handle, { backgroundColor: colors.border }]} />
            <Text style={[modalStyles.sheetTitle, { color: colors.textSecondary }]} numberOfLines={1}>
              Rest Timer · {restPickerFor?.exercise_name}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 14, textAlign: "center" }}>
              Used after each completed set of this exercise, in every workout.
            </Text>
            <View style={styles.restGrid}>
              {[null, ...REST_CHOICES].map((secs) => {
                const current = restPickerFor ? restOverrides[restPickerFor.exercise_id] : undefined;
                const selected = secs == null ? current == null : current === secs;
                return (
                  <Pressable
                    key={secs ?? "default"}
                    onPress={() => {
                      if (restPickerFor) setRestFor(restPickerFor.exercise_id, secs);
                      setRestPickerFor(null);
                    }}
                    style={[
                      styles.restChoice,
                      { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primaryLight : "transparent" },
                      secs == null && styles.restChoiceWide,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text style={{ color: selected ? colors.primary : colors.text, fontSize: 15, fontWeight: "700" }}>
                      {secs == null ? `Default (${formatRest(restDuration)})` : formatRest(secs)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              style={[modalStyles.cancelBtn, { backgroundColor: colors.surfaceSecondary }]}
              onPress={() => setRestPickerFor(null)}
            >
              <Text style={[modalStyles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <ConfirmModal
        visible={finishPrompt != null}
        title={finishPrompt?.title ?? ""}
        message={finishPrompt?.message ?? ""}
        confirmText="Finish"
        cancelText="Keep Going"
        confirmStyle="primary"
        icon="flag-outline"
        onConfirm={finishWorkout}
        onCancel={() => setFinishPrompt(null)}
      />

      <ConfirmModal
        visible={showDiscardModal}
        title="Discard Workout"
        message="This workout will be permanently deleted. This cannot be undone."
        confirmText="Discard"
        cancelText="Keep"
        confirmStyle="danger"
        icon="trash-outline"
        onConfirm={handleConfirmDiscard}
        onCancel={() => setShowDiscardModal(false)}
      />

      <WorkoutSummaryModal
        visible={summary != null}
        workoutName={session?.session_name ?? "Workout"}
        summary={summary}
        distanceUnit={distanceUnit}
        onAddPhoto={handleSummaryAddPhoto}
        onDone={handleSummaryDone}
      />

      <ProgressPhotoModal
        visible={showPhotoModal}
        isUploading={photoUploading}
        onPhoto={handleProgressPhoto}
        onSkip={() => { setShowPhotoModal(false); router.back(); }}
      />
    </KeyboardAvoidingView>
  );
}

// ─── ElapsedTime ─────────────────────────────────────────────────────────────

function formatElapsed(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h > 0 ? h + ":" : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Owns the once-a-second tick so only this label re-renders, not the whole
// workout screen and every exercise card under it.
function ElapsedTime({ startTs, running, style }: { startTs: number | null; running: boolean; style: any }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  const secs = startTs != null ? Math.max(0, Math.floor((now - startTs) / 1000)) : 0;
  return <Text style={style}>{formatElapsed(secs)}</Text>;
}

// ─── SetRow ──────────────────────────────────────────────────────────────────

const SetRow = memo(function SetRow({
  set,
  sessionExerciseId,
  onUpdate,
  onSetNumberPress,
  prevSet,
  onComplete,
}: {
  set: any;
  sessionExerciseId: number;
  onUpdate: (id: number, exId: number, updates: any) => void;
  onSetNumberPress: (set: any, sessionExerciseId: number) => void;
  prevSet?: any;
  onComplete?: (sessionExerciseId: number) => void;
}) {
  const { colors } = useTheme();
  // Weights are stored in lbs; inputs show and accept the user's display unit.
  const { unit, toDisplay, toStorage } = useUnits();
  const displayWeight = toDisplay(set.weight);
  const [weight, setWeight] = useState(formatNumberInput(displayWeight));
  const [reps, setReps] = useState(formatNumberInput(set.reps));
  const isFocused = useRef<"weight" | "reps" | null>(null);

  useEffect(() => {
    if (isFocused.current !== "weight") setWeight(formatNumberInput(toDisplay(set.weight)));
    if (isFocused.current !== "reps") setReps(formatNumberInput(set.reps));
  }, [set.weight, set.reps, unit, toDisplay]);

  // Only write when the value the user sees actually changed, so a kg↔lbs
  // round-trip never rewrites a stored weight with a rounded one.
  const weightUpdate = useCallback((text: string) => {
    const val = parseDecimalInput(text);
    if (val === displayWeight) return undefined;
    return toStorage(val);
  }, [displayWeight, toStorage]);

  const commitWeight = useCallback(() => {
    const next = weightUpdate(weight);
    if (next !== undefined) onUpdate(set.session_set_id, sessionExerciseId, { weight: next });
    setWeight(formatNumberInput(parseDecimalInput(weight)));
  }, [weight, weightUpdate, set.session_set_id, sessionExerciseId, onUpdate]);

  const commitReps = useCallback(() => {
    const val = parseIntInput(reps);
    if (val !== set.reps) onUpdate(set.session_set_id, sessionExerciseId, { reps: val });
    setReps(formatNumberInput(val));
  }, [reps, set.reps, set.session_set_id, sessionExerciseId, onUpdate]);

  const hasPrev = prevSet?.weight != null || prevSet?.reps != null;

  const toggleCompleted = useCallback(() => {
    const completing = !set.completed;
    const updates: any = { completed: completing };
    // Completing an empty set copies last session's numbers (like Strong/Hevy):
    // the "previous" column is the plan, so one tap logs "same as last time".
    if (completing && weight.trim() === "" && reps.trim() === "" && hasPrev) {
      setWeight(formatNumberInput(toDisplay(prevSet.weight)));
      setReps(formatNumberInput(prevSet.reps));
      // Copy the stored lbs value directly — going through the kg text and
      // back would drift it by rounding (225 lb → 102.1 kg → 225.1 lb).
      if (prevSet.weight !== set.weight) updates.weight = prevSet.weight ?? null;
      if (prevSet.reps !== set.reps) updates.reps = prevSet.reps ?? null;
    } else {
      const nextWeight = weightUpdate(weight);
      if (nextWeight !== undefined) updates.weight = nextWeight;
      const repsVal = parseIntInput(reps);
      if (repsVal !== set.reps) updates.reps = repsVal;
    }
    onUpdate(set.session_set_id, sessionExerciseId, updates);
    if (completing) {
      tapLight();
      onComplete?.(sessionExerciseId);
    }
  }, [weight, reps, set, hasPrev, prevSet, toDisplay, weightUpdate, sessionExerciseId, onUpdate, onComplete]);

  // Tap the "previous" value to copy it into this set without completing it.
  const fillFromPrevious = useCallback(() => {
    if (!hasPrev || set.completed) return;
    const updates: any = {};
    if (prevSet.weight != null) {
      setWeight(formatNumberInput(toDisplay(prevSet.weight)));
      if (prevSet.weight !== set.weight) updates.weight = prevSet.weight;
    }
    if (prevSet.reps != null) {
      setReps(formatNumberInput(prevSet.reps));
      if (prevSet.reps !== set.reps) updates.reps = prevSet.reps;
    }
    if (Object.keys(updates).length > 0) {
      tapLight();
      onUpdate(set.session_set_id, sessionExerciseId, updates);
    }
  }, [hasPrev, prevSet, set, toDisplay, sessionExerciseId, onUpdate]);

  const isCompleted = set.completed === true;
  const isWarmup = set.is_warmup === true;

  const prevWeight = toDisplay(prevSet?.weight);
  const prevText = prevWeight != null && prevSet?.reps != null
    ? `${prevWeight} × ${prevSet.reps}`
    : prevWeight != null
    ? `${prevWeight} ${unit}`
    : prevSet?.reps != null
    ? `${prevSet.reps} reps`
    : "—";

  const rowBg = isCompleted
    ? (colors.successLight + "80")
    : "transparent";

  return (
    <View style={[rowStyles.row, { backgroundColor: rowBg, borderBottomColor: colors.border }]}>
      {/* Set badge */}
      <Pressable
        style={[
          rowStyles.badge,
          isWarmup && { backgroundColor: colors.warningLight },
          isCompleted && { backgroundColor: colors.successLight },
        ]}
        onPress={() => onSetNumberPress(set, sessionExerciseId)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Set ${set.set_number} options`}
      >
        <Text style={[
          rowStyles.badgeText,
          { color: colors.textTertiary },
          isWarmup && { color: colors.warning },
          isCompleted && { color: colors.success },
        ]}>
          {isWarmup ? "W" : set.set_number}
        </Text>
      </Pressable>

      {/* Previous — tap to copy into this set */}
      <Pressable
        style={rowStyles.prevBtn}
        onPress={fillFromPrevious}
        disabled={!hasPrev || isCompleted}
        accessibilityRole="button"
        accessibilityLabel={hasPrev ? `Use previous: ${prevText}` : "No previous set"}
      >
        <Text style={[rowStyles.prevText, { color: colors.textTertiary }]} numberOfLines={1}>
          {prevText}
        </Text>
      </Pressable>

      {/* Weight input */}
      <TextInput
        style={[rowStyles.input, {
          backgroundColor: isCompleted ? colors.successLight : colors.inputBackground,
          color: isCompleted ? colors.success : colors.text,
        }]}
        value={weight}
        onChangeText={setWeight}
        onFocus={() => { isFocused.current = "weight"; }}
        onBlur={() => { isFocused.current = null; commitWeight(); }}
        keyboardType="decimal-pad"
        placeholder={prevWeight != null ? String(prevWeight) : "—"}
        placeholderTextColor={colors.textTertiary}
        editable={!isCompleted}
        selectTextOnFocus
        accessibilityLabel={`Set ${set.set_number} weight in ${unit}`}
      />

      {/* Reps input */}
      <TextInput
        style={[rowStyles.input, {
          backgroundColor: isCompleted ? colors.successLight : colors.inputBackground,
          color: isCompleted ? colors.success : colors.text,
        }]}
        value={reps}
        onChangeText={setReps}
        onFocus={() => { isFocused.current = "reps"; }}
        onBlur={() => { isFocused.current = null; commitReps(); }}
        keyboardType="number-pad"
        placeholder={prevSet?.reps != null ? String(prevSet.reps) : "—"}
        placeholderTextColor={colors.textTertiary}
        editable={!isCompleted}
        selectTextOnFocus
        accessibilityLabel={`Set ${set.set_number} reps`}
      />

      {/* Check button */}
      <Pressable
        style={[
          rowStyles.checkBtn,
          isCompleted
            ? { backgroundColor: colors.success, borderColor: colors.success }
            : { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
        ]}
        onPress={toggleCompleted}
        hitSlop={6}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isCompleted }}
        accessibilityLabel={`Complete set ${set.set_number}`}
      >
        <Ionicons
          name="checkmark"
          size={16}
          color={isCompleted ? "#fff" : colors.textTertiary}
        />
      </Pressable>
    </View>
  );
});

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 56,
    paddingBottom: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  headerBack: { width: 28 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "600", letterSpacing: -0.2 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  timerPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  timerText: { fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },
  finishPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  finishPillText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  // Stats bar
  statsBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statItem: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 15, fontWeight: "700" },
  statLabel: { fontSize: 11, fontWeight: "500", marginTop: 1 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 28, marginHorizontal: 4 },

  // Scroll
  scrollContent: { paddingBottom: 120 },

  // Error
  errorBanner: { margin: 16, padding: 12, borderRadius: 10 },
  errorText: { fontSize: 14, fontWeight: "500" },

  // Exercise card
  exerciseCard: {
    marginBottom: 1,
    paddingTop: 14,
  },
  exerciseHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  exerciseNameBtn: { flex: 1, marginRight: 8 },
  restPill: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, marginRight: 10,
  },
  restPillText: { fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] },
  restGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, width: "100%", marginBottom: 4 },
  restChoice: {
    flexBasis: "18%", flexGrow: 1, alignItems: "center", paddingVertical: 12,
    borderRadius: 10, borderWidth: 1,
  },
  restChoiceWide: { flexBasis: "100%" },
  exerciseName: { fontSize: 16, fontWeight: "700" },

  // Column headers
  colHeaders: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  colHeader: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3, textAlign: "center" },
  colSet: { width: 32 },
  colPrev: { flex: 1, textAlign: "left", paddingLeft: 4 },
  colVal: { width: 68, textAlign: "center" },
  colCheck: { width: 40 },

  // Add Set
  addSetBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginHorizontal: 16,
    marginVertical: 10,
    paddingVertical: 12,
    borderRadius: 10,
  },
  addSetText: { fontSize: 15, fontWeight: "600" },

  // Add Exercise
  addExerciseBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
  },
  addExerciseText: { fontSize: 16, fontWeight: "600" },

  // Notes
  notesInput: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    minHeight: 72,
    textAlignVertical: "top",
  },

  // Discard
  discardBtn: { alignItems: "center", paddingVertical: 20 },
  discardText: { fontSize: 15, fontWeight: "500" },
});

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 13, fontWeight: "700" },
  prevBtn: {
    flex: 1,
    alignSelf: "stretch",
    justifyContent: "center",
  },
  prevText: {
    fontSize: 13,
    paddingLeft: 4,
  },
  input: {
    width: 68,
    height: 40,
    borderRadius: 8,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
    padding: 0,
    paddingHorizontal: 4,
  },
  checkBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 44,
    paddingHorizontal: 16,
    alignItems: "center",
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  handle: { width: 36, height: 4, borderRadius: 2, marginBottom: 16 },
  sheetTitle: { fontSize: 12, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 12 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingVertical: 14,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  optionLabel: { fontSize: 16, fontWeight: "600", flex: 1 },
  cancelBtn: {
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },
  cancelText: { fontSize: 16, fontWeight: "600" },
});
