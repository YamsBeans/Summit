import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { showAlert } from "@/utils/alert";
import ConfirmModal from "@/components/ConfirmModal";
import ProgressPhotoModal from "@/components/ProgressPhotoModal";
import WorkoutSummaryModal from "@/components/WorkoutSummaryModal";
import PlateCalculatorModal from "@/components/PlateCalculatorModal";
import { ActionSheet, SheetOption } from "@/components/ActionSheet";
import { useExerciseRest, resolveRest, formatRest, REST_CHOICES } from "@/utils/exerciseRest";
import { buildWorkoutSummary, workoutNumberFrom, type SummaryPR, type WorkoutSummary } from "@/utils/workoutSummary";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useActiveWorkout } from "@/utils/ActiveWorkoutContext";
import Ionicons from "@expo/vector-icons/Ionicons";
import { db } from "@/backend/db";
import { useTheme } from "@/theme/ThemeContext";
import { useHeaderTop } from "@/utils/useHeaderTop";
import { useGuardedPress } from "@/utils/pressGuard";
import ExercisePicker from "@/components/ExercisePicker";
import RestTimerBanner from "@/components/RestTimerBanner";
import { useRestTimer } from "@/utils/useRestTimer";
import { detectPRs, detectCardioPRs, mergeStrengthRecord, groupSetsByExercise, liveWeightPRSetIds } from "@/utils/prDetection";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { beginRestNotification, scheduleRestDoneNotification, cancelRestDoneNotification } from "@/utils/notifications";
import { useUnits, useDistanceUnit, formatVolume } from "@/utils/units";
import { logError } from "@/utils/log";
import { createSerialQueue, nextSetNumber, previousSetFor, renumberChanges, workingSetNumber } from "@/utils/setNumbers";
import { loadBarWeight, usesBarbell, warmupPlan } from "@/utils/warmups";
import { notifySuccess } from "@/utils/haptics";
import CardioSetRow from "@/components/CardioSetRow";
import StrengthSetRow from "@/components/StrengthSetRow";
import ExerciseNote from "@/components/ExerciseNote";
import ElapsedTime from "@/components/ElapsedTime";
import { formatDistance, formatDurationShort } from "@/utils/cardioUtils";

export default function WorkoutScreen() {
  const headerTop = useHeaderTop();
  const router = useRouter();
  const navigation = useNavigation();
  const scrollRef = useRef<ScrollView>(null);
  const { colors } = useTheme();
  const { minimizeWorkout, clearActiveWorkout } = useActiveWorkout();
  const { unit, toDisplay, toStorage, label: unitLabel } = useUnits();
  const { distanceUnit } = useDistanceUnit();
  const { sessionId: sessionIdParam } = useLocalSearchParams<{ sessionId: string }>();

  const [session, setSession] = useState<any>(null);
  const [exercises, setExercises] = useState<any[]>([]);
  const [exerciseSets, setExerciseSets] = useState<Record<number, any[]>>({});
  // Latest sets for queued add/delete jobs, which run after their render.
  const exerciseSetsRef = useRef(exerciseSets);
  exerciseSetsRef.current = exerciseSets;
  const setJobs = useRef(createSerialQueue()).current;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  // Workout notes are saved as you type (debounced) and when the screen
  // closes, not only on Finish, so they survive the app being closed.
  const savedNotesRef = useRef<string | null>(null);
  const notesRef = useRef({ notes, sessionId: null as number | null });
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
  // Records as they stood before this workout, for live PR badges.
  const [records, setRecords] = useState<any[] | null>(null);
  const [exerciseOptionsVisible, setExerciseOptionsVisible] = useState(false);
  // Exercises whose note box is open (it's always shown once a note exists).
  // Value bumps each time "Add/Edit Note" is chosen, which focuses the box.
  const [noteFocus, setNoteFocus] = useState<Record<number, number>>({});
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
    const token = beginRestNotification();
    AsyncStorage.getItem("@gym_tracker_notifications").then((val) => {
      if (val === "true") scheduleRestDoneNotification(secs, token);
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
    const token = beginRestNotification();
    AsyncStorage.getItem("@gym_tracker_notifications").then((val) => {
      if (val === "true") scheduleRestDoneNotification(next, token);
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


  const prSetIds = useMemo(
    () => liveWeightPRSetIds(exercises, exerciseSets, records ?? []),
    [exercises, exerciseSets, records],
  );
  // A buzz when a set newly becomes a PR (not on load or when one is undone).
  const seenPRs = useRef<Set<number> | null>(null);
  useEffect(() => {
    // Wait for the records too: they load after the sets, and comparing
    // against "no records" would buzz for PR sets already logged.
    if (loading || records == null) return;
    const prev = seenPRs.current;
    seenPRs.current = prSetIds;
    if (prev && [...prSetIds].some((id) => !prev.has(id))) notifySuccess();
  }, [prSetIds, loading, records]);

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
      savedNotesRef.current = sessionResult.data.notes ?? "";
      // Register in context so the bar is visible even while inside the workout screen
      if (!sessionResult.data.end_time) {
        const ts = new Date(
          sessionResult.data.session_date + "T" + sessionResult.data.start_time
        ).getTime();
        minimizeWorkout(sessionResult.data.session_id, sessionResult.data.session_name, ts);
      }
    }

    const exs = [...(exercisesResult.data ?? [])].sort((a: any, b: any) => a.exercise_order - b.exercise_order);
    setExercises(exs);

    const userId = userResult.data?.user?.id;
    if (userId) {
      db.getPersonalRecords(userId)
        .then(({ data }) => setRecords(data ?? []))
        .catch((e) => logError("loadSession.getPersonalRecords", e));
    }

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
    exerciseSetsRef.current = { ...exerciseSetsRef.current, [sessionExerciseId]: data ?? [] };
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

  const addSet = useGuardedPress((sessionExerciseId: number) => setJobs(sessionExerciseId, async () => {
    const currentSets = exerciseSetsRef.current[sessionExerciseId] ?? [];
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
      set_number: nextSetNumber(currentSets),
      weight: prefillWeight,
      reps: prefillReps,
      is_warmup: false,
    });
    if (error) setError(error.message);
    else await reloadSetsForExercise(sessionExerciseId);
  }), 300);

  const deleteSet = (sessionSetId: number, sessionExerciseId: number) => setJobs(sessionExerciseId, async () => {
    const remaining = (exerciseSetsRef.current[sessionExerciseId] ?? []).filter((s) => s.session_set_id !== sessionSetId);
    // Close the gap so the next added set doesn't reuse a number and the
    // routine sync lines sets up by position.
    const changes = renumberChanges(remaining);
    const renumbered = new Map(changes.map((c) => [c.set.session_set_id, c.set_number]));
    const apply = (list: any[]) => list
      .filter((s) => s.session_set_id !== sessionSetId)
      .map((s) => (renumbered.has(s.session_set_id) ? { ...s, set_number: renumbered.get(s.session_set_id)! } : s));
    exerciseSetsRef.current = { ...exerciseSetsRef.current, [sessionExerciseId]: remaining.map((s) =>
      renumbered.has(s.session_set_id) ? { ...s, set_number: renumbered.get(s.session_set_id)! } : s) };
    setExerciseSets((prev) => ({ ...prev, [sessionExerciseId]: apply(prev[sessionExerciseId] ?? []) }));

    const { error } = await db.deleteSessionExerciseSet(sessionSetId);
    if (error) {
      setError(error.message);
      reloadSetsForExercise(sessionExerciseId);
      return;
    }
    for (const c of changes) {
      const { error: numErr } = await db.updateSessionExerciseSet(c.set.session_set_id, { set_number: c.set_number });
      if (numErr) logError("deleteSet.renumber", numErr);
    }
  });

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

  const selectedSetLabel = useMemo(() => {
    if (!selectedSet || selectedExerciseId == null) return "Set";
    if (selectedSet.is_warmup) return "Warm-up Set";
    const sets = exerciseSets[selectedExerciseId] ?? [];
    const idx = sets.findIndex((s) => s.session_set_id === selectedSet.session_set_id);
    return `Set ${idx >= 0 ? workingSetNumber(sets, idx) : selectedSet.set_number}`;
  }, [selectedSet, selectedExerciseId, exerciseSets]);

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
    let workoutNumber: number | null = null;

    try {
      const { data: userData } = await db.getUser();
      const userId = userData?.user?.id;
      if (userId) {
        const [{ data: existingPRs }, history] = await Promise.all([
          db.getPersonalRecords(userId),
          db.getWorkoutSessions(userId).catch(() => null),
        ]);
        workoutNumber = workoutNumberFrom(history?.data, session.session_id);

        // Strength PRs
        const strengthExercises = exercises.filter((e: any) => e.exercise_type !== 'cardio');
        const prs = detectPRs(strengthExercises, exerciseSets, existingPRs ?? []);
        const setsByExercise = new Map(
          groupSetsByExercise(exercises, exerciseSets).map((g) => [g.exercise.exercise_id, g.sets]));
        for (const pr of prs) {
          const sets = setsByExercise.get(pr.exerciseId) ?? [];
          const prev = (existingPRs ?? []).find((r: any) => r.exercise_id === pr.exerciseId && r.pr_type !== 'cardio');
          const merged = mergeStrengthRecord(sets, prev);
          await db.upsertPersonalRecord({ user_id: userId, exercise_id: pr.exerciseId, ...merged, pr_type: 'strength' });
        }

        // Cardio PRs
        const cardioExercises = exercises.filter((e: any) => e.exercise_type === 'cardio');
        for (const { exercise: ex, sets } of groupSetsByExercise(cardioExercises, exerciseSets)) {
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
    setSummary({ ...buildWorkoutSummary(exercises, exerciseSets, summaryPRs, durationSeconds), workoutNumber });
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

  // "Warm-up Sets" (like Strong's warm-up calculator): ramp up to the first
  // working set's weight (typed, or last time's). Unticked warm-ups are
  // replaced, so running it again after changing the weight re-plans them.
  const addWarmupSets = useGuardedPress((ex: any) => setJobs(ex.session_exercise_id, async () => {
    const sets = exerciseSetsRef.current[ex.session_exercise_id] ?? [];
    const firstWorkIdx = sets.findIndex((s) => !s.is_warmup);
    const prevWork = (prevSets[ex.exercise_id] ?? []).find((p: any) => !p.is_warmup && p.weight != null);
    const workingLbs = (firstWorkIdx >= 0 ? sets[firstWorkIdx].weight : null) ?? prevWork?.weight ?? null;
    const working = toDisplay(workingLbs);
    if (working == null || working <= 0) {
      showAlert("Add a working weight", "Type the weight for your first working set, then add warm-up sets.");
      return;
    }
    const bar = usesBarbell(ex.exercise_id) ? await loadBarWeight(unit) : 0;
    const plan = warmupPlan(working, unit, bar);
    if (plan.length === 0) {
      showAlert("No warm-ups needed", `${working} ${unitLabel} is light enough to start with.`);
      return;
    }
    setError(null);
    const stale = sets.filter((s) => s.is_warmup && !s.completed);
    const kept = sets.filter((s) => !stale.includes(s));
    for (const s of stale) {
      const { error } = await db.deleteSessionExerciseSet(s.session_set_id);
      if (error) { setError(error.message); await reloadSetsForExercise(ex.session_exercise_id); return; }
    }
    // Completed warm-ups stay first, then the new ones, then working sets.
    const doneWarm = kept.filter((s) => s.is_warmup);
    const work = kept.filter((s) => !s.is_warmup);
    const start = doneWarm.length;
    const moves = [...doneWarm, ...work]
      .map((s, i) => ({ s, n: i < start ? i + 1 : i + 1 + plan.length }))
      .filter(({ s, n }) => s.set_number !== n);
    for (const { s, n } of moves) {
      const { error } = await db.updateSessionExerciseSet(s.session_set_id, { set_number: n });
      if (error) { setError(error.message); await reloadSetsForExercise(ex.session_exercise_id); return; }
    }
    const results = await Promise.all(plan.map((w, i) => db.insertSessionExerciseSet({
      session_exercise_id: ex.session_exercise_id,
      set_number: start + i + 1,
      weight: toStorage(w.weight),
      reps: w.reps,
      is_warmup: true,
    })));
    const insErr = results.find((r: any) => r.error)?.error;
    if (insErr) setError(insErr.message);
    await reloadSetsForExercise(ex.session_exercise_id);
  }), 300);

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

  const saveExerciseNote = useCallback(async (sessionExerciseId: number, text: string) => {
    const notes = text.trim();
    setExercises((prev) => prev.map((e) =>
      e.session_exercise_id === sessionExerciseId ? { ...e, notes } : e
    ));
    const { error } = await db.updateSessionExercise(sessionExerciseId, { notes });
    if (error) setError(error.message);
  }, []);

  // Move an exercise up or down (swap exercise_order with its neighbour).
  const moveExercise = useCallback(async (exId: number, dir: -1 | 1) => {
    const prev = exercisesRef.current;
    const idx = prev.findIndex((e) => e.session_exercise_id === exId);
    const other = prev[idx + dir];
    if (idx < 0 || !other) return;
    const swapped = [...prev];
    swapped[idx] = other;
    swapped[idx + dir] = prev[idx];
    // Renumber 1..n: keeps orders distinct even if two collided before.
    const next = swapped.map((e, i) => ({ ...e, exercise_order: i + 1 }));
    const changed = next.filter((e) =>
      prev.find((o) => o.session_exercise_id === e.session_exercise_id)?.exercise_order !== e.exercise_order);
    exercisesRef.current = next;
    setExercises(next);
    const results = await Promise.all(changed.map((e) =>
      db.updateSessionExercise(e.session_exercise_id, { exercise_order: e.exercise_order })));
    const err = results.find((r: any) => r?.error)?.error;
    if (err) setError(err.message);
  }, []);

  const handleReplaceExercise = useGuardedPress(async (exercise: any) => {
    const target = replaceTargetRef.current;
    if (!target) return;
    setShowAddExercise(false);
    // Swapping squats for a run must switch the rows to distance/time too;
    // the type used to stay as it was.
    const exType = exercise.exercise_type ?? target.exercise_type ?? "strength";
    const { error } = await db.updateSessionExercise(target.session_exercise_id, {
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      exercise_type: exType,
    });
    if (error) { setError(error.message); replaceTargetRef.current = null; return; }
    setExercises((prev) => prev.map((e) =>
      e.session_exercise_id === target.session_exercise_id
        ? { ...e, exercise_id: exercise.id, exercise_name: exercise.name, exercise_type: exType }
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

  // Load once on open; loadSession reads the route param, which doesn't change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadSession(); }, []);

  notesRef.current = { notes, sessionId: session && !session.end_time ? session.session_id : null };
  const flushNotes = useCallback(() => {
    const { notes: n, sessionId } = notesRef.current;
    if (sessionId == null || savedNotesRef.current == null || n === savedNotesRef.current) return;
    savedNotesRef.current = n;
    db.updateWorkoutSession(sessionId, { notes: n || null }).catch(() => {});
  }, []);
  useEffect(() => {
    const id = setTimeout(flushNotes, 1000);
    return () => clearTimeout(id);
  }, [notes, flushNotes]);
  useEffect(() => flushNotes, [flushNotes]); // on unmount

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
      <View style={[styles.header, { paddingTop: headerTop, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
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
        {/* Always shown for strength workouts so the bar doesn't jump on the first set (like Hevy). */}
        {(totalVolume > 0 || !exercises.length || exercises.some((e: any) => e.exercise_type !== "cardio")) && (
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

              {(ex.notes || noteFocus[ex.session_exercise_id] != null) && (
                <ExerciseNote
                  initial={ex.notes ?? ""}
                  focusKey={noteFocus[ex.session_exercise_id] ?? 0}
                  onSave={(text) => saveExerciseNote(ex.session_exercise_id, text)}
                />
              )}

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
                    prevSet={previousSetFor(prevSets[ex.exercise_id], sets, idx)}
                    onComplete={startRestTimer}
                    distanceUnit={distanceUnit}
                  />
                ) : (
                  <StrengthSetRow
                    key={set.session_set_id}
                    set={set}
                    // Working sets count 1, 2, 3 after any warm-ups (W), like Strong.
                    workingNumber={workingSetNumber(sets, idx) ?? undefined}
                    sessionExerciseId={ex.session_exercise_id}
                    onUpdate={updateSet}
                    onSetNumberPress={openSetOptions}
                    prevSet={previousSetFor(prevSets[ex.exercise_id], sets, idx)}
                    onComplete={startRestTimer}
                    isPR={prSetIds.has(set.session_set_id)}
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
      <ActionSheet visible={setOptionsVisible} onClose={closeSetOptions} title={selectedSetLabel}>
        <SheetOption
          emoji="🔥"
          tone="warning"
          label={selectedSet?.is_warmup ? "Remove Warmup" : "Mark as Warmup"}
          onPress={handleToggleWarmup}
        />
        {exercises.find((e) => e.session_exercise_id === selectedExerciseId)?.exercise_type !== "cardio" && (
          <SheetOption
            icon="barbell-outline"
            label="Plate Calculator"
            onPress={() => {
              const ex = exercises.find((e) => e.session_exercise_id === selectedExerciseId);
              const exSets = exerciseSets[selectedExerciseId ?? -1] ?? [];
              const idx = exSets.findIndex((s) => s.session_set_id === selectedSet?.session_set_id);
              const prev = ex ? previousSetFor(prevSets[ex.exercise_id], exSets, idx) : null;
              const w = toDisplay(selectedSet?.weight ?? prev?.weight ?? null);
              closeSetOptions();
              setTimeout(() => setPlateWeight(w), Platform.OS === "ios" ? 400 : 0);
            }}
          />
        )}
        <SheetOption icon="trash-outline" tone="danger" label="Remove Set" onPress={handleRemoveSet} last />
      </ActionSheet>

      {/* Exercise options bottom sheet */}
      <ActionSheet visible={exerciseOptionsVisible} onClose={closeExerciseOptions} title={selectedExerciseForOptions?.exercise_name}>
        <SheetOption
          icon="create-outline"
          label={selectedExerciseForOptions?.notes ? "Edit Note" : "Add Note"}
          onPress={() => {
            const ex = selectedExerciseForOptions;
            closeExerciseOptions();
            if (ex) setNoteFocus((prev) => ({ ...prev, [ex.session_exercise_id]: (prev[ex.session_exercise_id] ?? 0) + 1 }));
          }}
        />
        {exercises.length > 1 && (() => {
          const idx = exercises.findIndex((e) => e.session_exercise_id === selectedExerciseForOptions?.session_exercise_id);
          const btn = (dir: -1 | 1, icon: "arrow-up" | "arrow-down", label: string, disabled: boolean) => (
            <Pressable
              key={label}
              disabled={disabled}
              onPress={() => {
                const ex = selectedExerciseForOptions;
                closeExerciseOptions();
                if (ex) moveExercise(ex.session_exercise_id, dir);
              }}
              accessibilityRole="button"
              accessibilityLabel={label}
              hitSlop={6}
              style={{ padding: 8, borderRadius: 8, backgroundColor: colors.surfaceSecondary, opacity: disabled ? 0.35 : 1 }}
            >
              <Ionicons name={icon} size={16} color={colors.text} />
            </Pressable>
          );
          return (
            <SheetOption icon="reorder-three-outline" label="Reorder" style={{ gap: 10 }}>
              {btn(-1, "arrow-up", "Move up", idx <= 0)}
              {btn(1, "arrow-down", "Move down", idx < 0 || idx >= exercises.length - 1)}
            </SheetOption>
          );
        })()}
        <SheetOption
          icon="swap-horizontal-outline"
          label="Replace Exercise"
          onPress={() => {
            exercisePickerModeRef.current = "replace";
            replaceTargetRef.current = selectedExerciseForOptions;
            closeExerciseOptions();
            setShowAddExercise(true);
          }}
        />
        {selectedExerciseForOptions?.exercise_type !== "cardio" && selectedExerciseForOptions?.exercise_type !== "stretching" && (
          <SheetOption
            icon="flame-outline"
            label="Warm-up Sets"
            onPress={() => {
              const ex = selectedExerciseForOptions;
              closeExerciseOptions();
              if (ex) addWarmupSets(ex);
            }}
          />
        )}
        <SheetOption
          icon="timer-outline"
          label="Rest Timer"
          value={formatRest(resolveRest(restOverrides, selectedExerciseForOptions?.exercise_id, restDuration))}
          onPress={() => {
            const ex = selectedExerciseForOptions;
            closeExerciseOptions();
            // Let the options sheet close before opening the next one (iOS).
            setTimeout(() => setRestPickerFor(ex), Platform.OS === "ios" ? 400 : 0);
          }}
        />
        <SheetOption icon="trash-outline" tone="danger" label="Remove Exercise" onPress={handleRemoveExercise} last />
      </ActionSheet>

      <PlateCalculatorModal
        visible={plateWeight !== undefined}
        initialWeight={plateWeight ?? null}
        onClose={() => setPlateWeight(undefined)}
      />

      {/* Per-exercise rest timer picker */}
      <ActionSheet
        visible={restPickerFor != null}
        onClose={() => setRestPickerFor(null)}
        title={`Rest Timer · ${restPickerFor?.exercise_name ?? ""}`}
      >
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
      </ActionSheet>

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
