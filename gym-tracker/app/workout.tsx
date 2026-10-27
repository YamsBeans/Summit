import { memo, useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import ConfirmModal from "@/components/ConfirmModal";
import ProgressPhotoModal from "@/components/ProgressPhotoModal";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useActiveWorkout } from "@/utils/ActiveWorkoutContext";
import Ionicons from "@expo/vector-icons/Ionicons";
import { db } from "@/backend/db";
import { useTheme } from "@/theme/ThemeContext";
import { useGuardedPress } from "@/utils/pressGuard";
import ExercisePicker from "@/components/ExercisePicker";
import RestTimerBanner from "@/components/RestTimerBanner";
import { useRestTimer } from "@/utils/useRestTimer";
import { detectPRs, detectCardioPRs } from "@/utils/prDetection";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { scheduleRestDoneNotification, cancelRestDoneNotification } from "@/utils/notifications";
import { useUnits } from "@/utils/units";
import { logError } from "@/utils/log";
import CardioSetRow from "@/components/CardioSetRow";
import { computePace, formatDistance, formatDuration, metersToDisplay, parseDistanceToMeters, parseDuration, formatDurationShort } from "@/utils/cardioUtils";

export default function WorkoutScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const scrollRef = useRef<ScrollView>(null);
  const { colors } = useTheme();
  const { minimizeWorkout, clearActiveWorkout } = useActiveWorkout();
  const { toDisplay, label: unitLabel } = useUnits();
  const { sessionId: sessionIdParam } = useLocalSearchParams<{ sessionId: string }>();

  const [session, setSession] = useState<any>(null);
  const [exercises, setExercises] = useState<any[]>([]);
  const [exerciseSets, setExerciseSets] = useState<Record<number, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
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
  const [setOptionsVisible, setSetOptionsVisible] = useState(false);
  const [selectedSet, setSelectedSet] = useState<any>(null);
  const [selectedExerciseId, setSelectedExerciseId] = useState<number | null>(null);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [prevSets, setPrevSets] = useState<Record<string, any[]>>({});
  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi'>('km');
  const [exerciseOptionsVisible, setExerciseOptionsVisible] = useState(false);
  const [selectedExerciseForOptions, setSelectedExerciseForOptions] = useState<any>(null);
  const exercisePickerModeRef = useRef<"add" | "replace">("add");
  const replaceTargetRef = useRef<any>(null);

  const restTimer = useRestTimer();

  const startRestTimer = useCallback(() => {
    restTimer.start();
    AsyncStorage.getItem("@gym_tracker_notifications").then((val) => {
      if (val === "true") scheduleRestDoneNotification(restTimer.duration);
    });
  }, [restTimer]);

  const skipRestTimer = useCallback(() => {
    restTimer.skip();
    cancelRestDoneNotification();
  }, [restTimer]);

  // Keep the scheduled "rest complete" notification in sync when the user
  // extends the timer — otherwise it still fires at the original end time.
  const handleAddRestTime = useCallback((secs: number) => {
    restTimer.addTime(secs);
    AsyncStorage.getItem("@gym_tracker_notifications").then((val) => {
      if (val === "true") scheduleRestDoneNotification(restTimer.remaining + secs);
    });
  }, [restTimer]);

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

  // Load distance unit preference
  useEffect(() => {
    AsyncStorage.getItem('@gym_tracker_distance_unit').then((val) => {
      if (val === 'mi') setDistanceUnit('mi');
    });
  }, []);

  const completedSetsCount = useMemo(() =>
    Object.values(exerciseSets).flat().filter((s) => s.completed).length,
    [exerciseSets]
  );

  useEffect(() => {
    if (!session || session.end_time) return;
    // Derive real start time from DB fields so the timer survives remounts
    const ts = new Date(session.session_date + "T" + session.start_time).getTime();
    startTimestamp.current = ts;
    setElapsed(Math.floor((Date.now() - ts) / 1000));
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimestamp.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [session?.session_id]);

  const formatTime = useCallback((seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? h + ":" : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, []);

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

  const finishWorkout = useGuardedPress(async () => {
    if (!session) return;
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
    cancelRestDoneNotification();
    clearActiveWorkout();
    finishedSessionId.current = session.session_id;

    try {
      const { data: userData } = await db.getUser();
      const userId = userData?.user?.id;
      if (userId) {
        const { data: existingPRs } = await db.getPersonalRecords(userId);

        // Strength PRs
        const strengthExercises = exercises.filter((e: any) => e.exercise_type !== 'cardio');
        const prs = detectPRs(strengthExercises, exerciseSets, existingPRs ?? []);
        for (const pr of prs) {
          const sets = (exerciseSets[exercises.find((e: any) => e.exercise_id === pr.exerciseId)?.session_exercise_id] ?? []).filter((s: any) => s.completed);
          const maxW = sets.reduce((m: number, s: any) => (s.weight != null && s.weight > m ? s.weight : m), 0);
          const maxVol = sets.reduce((sum: number, s: any) => s.weight && s.reps ? sum + s.weight * s.reps : sum, 0);
          await db.upsertPersonalRecord({ user_id: userId, exercise_id: pr.exerciseId, max_weight: maxW || null, max_volume: maxVol || null, pr_type: 'strength' });
        }

        // Cardio PRs
        const cardioExercises = exercises.filter((e: any) => e.exercise_type === 'cardio');
        const cardioPRMessages: string[] = [];
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
              best_distance_meters: cardioPR.bestDistanceMeters ?? null,
              best_pace_sec_per_km: cardioPR.bestPaceSecPerKm ?? null,
              best_duration_seconds: cardioPR.bestDurationSeconds ?? null,
            });
            if (cardioPR.bestDistanceMeters) cardioPRMessages.push(`${ex.exercise_name}: ${formatDistance(cardioPR.bestDistanceMeters, distanceUnit)}`);
            else if (cardioPR.bestPaceSecPerKm) cardioPRMessages.push(`${ex.exercise_name}: best pace`);
          }
        }

        const allPRMessages = [
          ...prs.map((p: any) => `${p.exerciseName} (${p.type === "both" ? "weight & volume" : p.type})`),
          ...cardioPRMessages,
        ];
        if (allPRMessages.length > 0) {
          Alert.alert(
            "New PRs!",
            allPRMessages.join("\n"),
            [{ text: "OK", onPress: () => setShowPhotoModal(true) }]
          );
          return;
        }
      }
    } catch (e) { logError("finishWorkout.prDetection", e); }
    setShowPhotoModal(true);
  }, 1000);

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
          Alert.alert("Photo Upload Failed", uploadError, [{ text: "OK", onPress: () => router.back() }]);
          return;
        }
        if (url) {
          const { error: saveError } = await db.updateSessionPhotoUrl(sessionId, url) as any;
          if (saveError) {
            setPhotoUploading(false);
            setShowPhotoModal(false);
            Alert.alert("Photo Save Failed", saveError.message ?? "Could not link photo to workout.", [{ text: "OK", onPress: () => router.back() }]);
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
    cancelRestDoneNotification();
    clearActiveWorkout();
    isMinimizingRef.current = true;
    await db.deleteWorkoutSession(session.session_id);
    router.back();
  }, [session, clearActiveWorkout, router]);

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

  const volumeDisplay = (toDisplay(totalVolume) ?? totalVolume).toLocaleString();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* ── Sticky header ── */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Pressable onPress={handleMinimize} hitSlop={8} style={styles.headerBack}>
          <Ionicons name="chevron-down" size={22} color={colors.textSecondary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {session.session_name}
        </Text>
        <View style={styles.headerRight}>
          <Pressable style={[styles.finishPill, { backgroundColor: colors.primary }]} onPress={finishWorkout}>
            <Text style={styles.finishPillText}>Finish</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Stats bar ── */}
      <View style={[styles.statsBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.primary }]}>{formatTime(elapsed)}</Text>
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
                    params: { exerciseId: ex.exercise_id, exerciseName: ex.exercise_name },
                  })}
                >
                  <Text style={[styles.exerciseName, { color: colors.primary }]}>
                    {ex.exercise_name}
                  </Text>
                </Pressable>
                <Pressable onPress={() => openExerciseOptions(ex)} hitSlop={8}>
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

      <ProgressPhotoModal
        visible={showPhotoModal}
        isUploading={photoUploading}
        onPhoto={handleProgressPhoto}
        onSkip={() => { setShowPhotoModal(false); router.back(); }}
      />
    </KeyboardAvoidingView>
  );
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
  onComplete?: () => void;
}) {
  const { colors } = useTheme();
  const [weight, setWeight] = useState(set.weight != null ? String(set.weight) : "");
  const [reps, setReps] = useState(set.reps != null ? String(set.reps) : "");
  const isFocused = useRef<"weight" | "reps" | null>(null);

  useEffect(() => {
    if (isFocused.current !== "weight") setWeight(set.weight != null ? String(set.weight) : "");
    if (isFocused.current !== "reps") setReps(set.reps != null ? String(set.reps) : "");
  }, [set.weight, set.reps]);

  const commitWeight = useCallback(() => {
    const val = weight ? parseFloat(weight) : null;
    if (val !== set.weight) onUpdate(set.session_set_id, sessionExerciseId, { weight: val });
  }, [weight, set.weight, set.session_set_id, sessionExerciseId, onUpdate]);

  const commitReps = useCallback(() => {
    const val = reps ? parseInt(reps, 10) : null;
    if (val !== set.reps) onUpdate(set.session_set_id, sessionExerciseId, { reps: val });
  }, [reps, set.reps, set.session_set_id, sessionExerciseId, onUpdate]);

  const toggleCompleted = useCallback(() => {
    const weightVal = weight ? parseFloat(weight) : null;
    const repsVal = reps ? parseInt(reps, 10) : null;
    const completing = !set.completed;
    const updates: any = { completed: completing };
    if (weightVal !== set.weight) updates.weight = weightVal;
    if (repsVal !== set.reps) updates.reps = repsVal;
    onUpdate(set.session_set_id, sessionExerciseId, updates);
    if (completing) onComplete?.();
  }, [weight, reps, set, sessionExerciseId, onUpdate, onComplete]);

  const isCompleted = set.completed === true;
  const isWarmup = set.is_warmup === true;

  const prevText = prevSet?.weight != null && prevSet?.reps != null
    ? `${prevSet.weight}${" × "}${prevSet.reps}`
    : prevSet?.weight != null
    ? `${prevSet.weight}`
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
      >
        <Text style={[
          rowStyles.badgeText,
          { color: colors.textTertiary },
          isWarmup && { color: "#ffd60a" },
          isCompleted && { color: colors.success },
        ]}>
          {isWarmup ? "W" : set.set_number}
        </Text>
      </Pressable>

      {/* Previous */}
      <Text style={[rowStyles.prevText, { color: colors.textTertiary }]} numberOfLines={1}>
        {prevText}
      </Text>

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
        keyboardType="numeric"
        placeholder="—"
        placeholderTextColor={colors.textTertiary}
        editable={!isCompleted}
        selectTextOnFocus
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
        keyboardType="numeric"
        placeholder="—"
        placeholderTextColor={colors.textTertiary}
        editable={!isCompleted}
        selectTextOnFocus
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
  prevText: {
    flex: 1,
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
