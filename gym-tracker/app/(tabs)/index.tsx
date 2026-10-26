// app/(tabs)/index.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  TextInput,
  SafeAreaView,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
} from 'react-native';
import { showAlert } from "@/utils/alert";
import { LinearGradient } from 'expo-linear-gradient';
import { Routine, RoutineCardio, Exercise, WorkoutLog, Set as WorkoutSet } from '@/types';
import exercisesData from '@/assets/data/exercises.json';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/backend/supabaseClient';
import ExerciseSearchModal from '@/components/ExerciseSearchModal';
import WorkoutKeyboard from '@/components/WorkoutKeyboard';

const STORAGE_KEY = '@workout_logs';
const SESSION_KEY = '@currentSessionId';
const ROUTINES_STORAGE_KEY = '@routines';
const CARDIO_TYPES: RoutineCardio["type"][] = [
  "bike",
  "treadmill",
  "stair-master",
  "elliptical",
  "running",
  "other",
];

const sessionCardioStorageKey = (sessionId: string) => `@session_cardio_${sessionId}`;

type SessionCardioPayload = {
  routineTemplateId: string | null;
  rows: RoutineCardio[];
};

function normalizeCardioType(raw: unknown): RoutineCardio["type"] {
  const v = typeof raw === "string" ? raw.toLowerCase() : "";
  return CARDIO_TYPES.includes(v as RoutineCardio["type"])
    ? (v as RoutineCardio["type"])
    : "other";
}

function normalizeCardioRow(row: any): RoutineCardio {
  return {
    id: String(row?.id ?? `cardio-${Date.now()}`),
    type: normalizeCardioType(row?.type ?? row?.name),
    duration: typeof row?.duration === "string" ? row.duration : "",
    unit: row?.unit === "hr" ? "hr" : "min",
    calories: typeof row?.calories === "string" ? row.calories : "",
  };
}

function parseSessionCardioPayload(raw: string | null): SessionCardioPayload {
  if (!raw) return { routineTemplateId: null, rows: [] };
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      return { routineTemplateId: null, rows: data.map(normalizeCardioRow) };
    }
    return {
      routineTemplateId: data.routineTemplateId ?? null,
      rows: Array.isArray(data.rows) ? data.rows.map(normalizeCardioRow) : [],
    };
  } catch {
    return { routineTemplateId: null, rows: [] };
  }
}

async function mergeCardioTemplateIntoRoutines(
  routineId: string | null,
  rows: RoutineCardio[]
) {
  if (!routineId || rows.length === 0) return;
  const stored = await AsyncStorage.getItem(ROUTINES_STORAGE_KEY);
  if (!stored) return;
  const list: Routine[] = JSON.parse(stored);
  const next = list.map((r) =>
    r.id === routineId ? { ...r, cardio: rows.map((row) => ({ ...row })) } : r
  );
  await AsyncStorage.setItem(ROUTINES_STORAGE_KEY, JSON.stringify(next));
}

type SessionData = {
  session_name?: string;
  notes?: string | null;
  sleep_hours?: number | null;
  nutrition?: 'good' | 'ok' | 'bad' | null;
  took_supps?: boolean | null;
  session_date?: string;
  start_time?: string;
};

type NutritionQuality = 'good' | 'ok' | 'bad';

type SetRowProps = {
  set: WorkoutSet;
  onToggleComplete: (setNumber: number) => void;
  onActivateField: (setNumber: number, field: 'reps' | 'weight') => void;
  isActive?: boolean;
  activeField?: 'reps' | 'weight';
};

type ExerciseCardProps = {
  exercise: Exercise;
  isFocused: boolean;
  onFocus: (exerciseId: string) => void;
  onCardLayout: (exerciseId: string, y: number, height: number) => void;
  focusedSetNumber?: number;
  focusedField?: 'reps' | 'weight';
  onRemove: (exerciseId: string) => void;
  onUpdateSet: (setNumber: number, field: 'reps' | 'weight', value: string) => void;
  onToggleSet: (exerciseId: string, setNumber: number) => void;
  onAddSet: (exerciseId: string) => void;
  onRemoveSet: (exerciseId: string) => void;
  onActiveTargetChange: (exerciseId: string, setNumber: number, field: 'reps' | 'weight') => void;
  onReplace?: (exerciseId: string) => void;
};

// Get today's date formatted
const getTodaysDate = () => {
  const date = new Date();
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

// Get current time
const getCurrentTime = () => {
  const date = new Date();
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatElapsedTime = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, '0'))
    .join(':');
};

const normalizeNutrition = (value: NutritionQuality | null | undefined): NutritionQuality => {
  return value ?? 'ok';
};

// Set Row Component
const SetRow = ({ set, onToggleComplete, onActivateField, isActive, activeField }: SetRowProps) => {
  return (
    <View style={[styles.setRow, isActive && styles.setRowActive, set.completed && styles.setRowCompleted]}>
      <TouchableOpacity
        style={[styles.checkbox, set.completed && styles.checkboxCompleted]}
        onPress={() => onToggleComplete(set.setNumber)}>
        {set.completed && <Text style={styles.checkmark}>✓</Text>}
      </TouchableOpacity>
      <View style={styles.setNumberCell}>
        <Text style={styles.setNumberText}>{set.setNumber}</Text>
      </View>
      <View style={styles.setInputCell}>
        <TouchableOpacity
          style={[
            styles.setInput,
            isActive && activeField === 'reps' && styles.activeInput,
            set.completed && styles.inputCompleted,
          ]}
          onPress={() => { if (!set.completed) onActivateField(set.setNumber, 'reps'); }}
          activeOpacity={set.completed ? 1 : 0.7}>
          <Text style={styles.setInputText}>{set.reps || '0'}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.setInputCell}>
        <TouchableOpacity
          style={[
            styles.setInput,
            isActive && activeField === 'weight' && styles.activeInput,
            set.completed && styles.inputCompleted,
          ]}
          onPress={() => { if (!set.completed) onActivateField(set.setNumber, 'weight'); }}
          activeOpacity={set.completed ? 1 : 0.7}>
          <Text style={styles.setInputText}>{set.weight || '0'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// Exercise Card Component
const ExerciseCard = ({
  exercise,
  isFocused,
  onFocus,
  onCardLayout,
  focusedSetNumber,
  focusedField,
  onRemove,
  onUpdateSet,
  onToggleSet,
  onAddSet,
  onRemoveSet,
  onActiveTargetChange,
  onReplace = (_id: string) => {},
}: ExerciseCardProps) => {
  const [expanded, setExpanded] = useState(true);
  const [activeSetIndex, setActiveSetIndex] = useState(0);
  const [activeField, setActiveField] = useState<'reps' | 'weight'>('reps');

  useEffect(() => {
    if (!isFocused || !focusedSetNumber) return;
    const nextIndex = exercise.sets.findIndex((set) => set.setNumber === focusedSetNumber);
    if (nextIndex < 0) return;

    const nextField = focusedField ?? activeField;
    const shouldUpdate = nextIndex !== activeSetIndex || nextField !== activeField;
    if (!shouldUpdate) return;

    setActiveSetIndex(nextIndex);
    if (focusedField) {
      setActiveField(focusedField);
    }
  }, [activeField, activeSetIndex, exercise.sets, focusedField, focusedSetNumber, isFocused]);

  // Reset to first set
  useEffect(() => {
    if (isFocused) {
      setActiveSetIndex(0);
      setActiveField('reps');
    }
  }, [isFocused]);

  const completedCount = exercise.sets.filter((s) => s.completed).length;

  return (
    <View
      style={[styles.exerciseCard, isFocused && styles.focusedExerciseCard]}
      onLayout={(e) => onCardLayout(exercise.id, e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
      onTouchStart={() => onFocus(exercise.id)}>
      {/* Exercise Header */}
      <View style={styles.exerciseHeader}>
        <View style={styles.exerciseHeaderLeft}>
          <TouchableOpacity onPress={() => setExpanded(!expanded)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.chevron}>{expanded ? '▼' : '▶'}</Text>
          </TouchableOpacity>
          <View style={styles.exerciseInfo}>
            <Text style={styles.exerciseName}>{exercise.name}</Text>
            <View style={styles.exerciseMetaRow}>
              <View style={styles.setCountContainer}>
                <Text style={styles.setCountValue}>{exercise.sets.length}</Text>
                <Text style={styles.exerciseMeta}>sets</Text>
              </View>
              <View style={styles.setAdjustControls}>
                <TouchableOpacity
                  style={styles.setAdjustButton}
                  onPress={() => onRemoveSet(exercise.id)}>
                  <Text style={styles.setAdjustButtonText}>−</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.setAdjustButton}
                  onPress={() => onAddSet(exercise.id)}>
                  <Text style={styles.setAdjustButtonText}>+</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.exerciseMeta}>• {exercise.muscleGroup}</Text>
              {completedCount > 0 && (
                <Text style={styles.completedBadge}>
                  • {completedCount}/{exercise.sets.length} done
                </Text>
              )}
            </View>
          </View>
        </View>
        
        <View style={styles.exerciseActions}>
          <TouchableOpacity
            style={styles.replaceButton}
            onPress={() => onReplace(exercise.id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.replaceIcon}>⟳</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.removeButton}
            onPress={() => onRemove(exercise.id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.removeIcon}>−</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Expanded Sets Table */}
      {expanded && (
        <View style={styles.setsTable}>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <View style={styles.checkboxPlaceholder} />
            <View style={styles.setNumberCell}>
              <Text style={styles.tableHeaderText}>Set</Text>
            </View>
            <View style={styles.setInputCell}>
              <Text style={styles.tableHeaderText}>Reps</Text>
            </View>
            <View style={styles.setInputCell}>
              <Text style={styles.tableHeaderText}>Lbs</Text>
            </View>
          </View>

          {/* Table Rows */}
          {exercise.sets.map((set: WorkoutSet, idx: number) => (
            <SetRow
              key={set.setNumber}
              set={set}
              isActive={isFocused && idx === activeSetIndex}
              activeField={activeField}
              onActivateField={(setNum: number, field: 'reps' | 'weight') => {
                setActiveSetIndex(idx);
                setActiveField(field);
                onFocus(exercise.id);
                onActiveTargetChange(exercise.id, setNum, field);
              }}
              onToggleComplete={(setNum: number) => onToggleSet(exercise.id, setNum)}
            />
          ))}
        </View>
      )}
    </View>
  );
};

export default function TodayScreen() {
  const router = useRouter();
  const { selectedRoutine: selectedRoutineParam } = useLocalSearchParams<{ selectedRoutine?: string | string[] }>();
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [selectedRoutine, setSelectedRoutine] = useState<Routine | null>(null);
  const [sessionCardio, setSessionCardio] = useState<RoutineCardio[]>([]);
  const [sessionRoutineTemplateId, setSessionRoutineTemplateId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [replaceExerciseId, setReplaceExerciseId] = useState<string | null>(null);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [sessionNotes, setSessionNotes] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [sessionSleepHours, setSessionSleepHours] = useState<number | null>(null);
  const [sleepHoursDraft, setSleepHoursDraft] = useState('');
  const [sessionNutrition, setSessionNutrition] = useState<NutritionQuality>('ok');
  const [nutritionDraft, setNutritionDraft] = useState<NutritionQuality>('ok');
  const [sessionSupps, setSessionSupps] = useState(false);
  const [suppsDraft, setSuppsDraft] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [timerOrigin, setTimerOrigin] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [focusedExerciseId, setFocusedExerciseId] = useState<string | null>(null);
  const [activeInputTarget, setActiveInputTarget] = useState<{
    exerciseId: string;
    setNumber: number;
    field: 'reps' | 'weight';
  } | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const cardLayoutMapRef = useRef<{ [id: string]: { y: number; height: number } }>({});

  const buildPresetSetsFromRoutine = (routineExercise: Routine['exercises'][number]) => {
    if (routineExercise.sets && routineExercise.sets.length > 0) {
      return routineExercise.sets.map((set, index) => ({
        setNumber: set.setNumber || index + 1,
        reps: set.reps || '',
        weight: set.weight || '',
      }));
    }

    const setCount = routineExercise.defaultSetCount || 3;
    return Array.from({ length: setCount }, (_, i) => ({
      setNumber: i + 1,
      reps: '',
      weight: '',
    }));
  };

  // Load session status and user ID on mount
  useEffect(() => {
    initializeScreen();
  }, []);

  useEffect(() => {
    if (!selectedRoutineParam) return;

    const rawParam = Array.isArray(selectedRoutineParam)
      ? selectedRoutineParam[0]
      : selectedRoutineParam;

    if (!rawParam) return;

    try {
      const parsedRoutine = JSON.parse(rawParam) as Routine;
      if (!parsedRoutine?.id) return;

      const routineFromStorage = routines.find((routine) => routine.id === parsedRoutine.id);
      setSelectedRoutine(routineFromStorage || parsedRoutine);
    } catch (error) {
      console.error('Failed to parse selected routine param:', error);
    }
  }, [selectedRoutineParam, routines]);

  const clearTimerInterval = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  const startTimer = useCallback((originMs: number) => {
    clearTimerInterval();
    setTimerOrigin(originMs);
    setIsTimerRunning(true);

    const updateElapsed = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - originMs) / 1000)));
    };

    updateElapsed();
    timerIntervalRef.current = setInterval(updateElapsed, 1000);
  }, [clearTimerInterval]);

  const pauseTimer = useCallback(() => {
    clearTimerInterval();
    setIsTimerRunning(false);
  }, [clearTimerInterval]);

  useEffect(() => {
    return () => {
      clearTimerInterval();
    };
  }, [clearTimerInterval]);

  const initializeScreen = async () => {
    setLoading(true);
    try {
      const storedUserId = await AsyncStorage.getItem('userId');
      setUserId(storedUserId);

      const storedSessionId = await AsyncStorage.getItem(SESSION_KEY);
      const sessionId =
        storedSessionId && storedSessionId !== 'undefined' && storedSessionId !== 'null'
          ? storedSessionId
          : null;

      if (!sessionId && storedSessionId) {
        await AsyncStorage.removeItem(SESSION_KEY);
      }

      if (sessionId) {
        await loadSession(sessionId);
        setCurrentSessionId(sessionId);
      } else {
        await loadRoutines(storedUserId);
      }
    } catch (error) {
      console.error('Failed to initialize screen:', error);
      showAlert('Error', 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadRoutines = async (uid: string | null) => {
    try {
      const saved = await AsyncStorage.getItem('@routines');
      if (saved) {
        const parsedRoutines = JSON.parse(saved);
        setRoutines(parsedRoutines);
      } else {
        setRoutines([]);
      }
    } catch (error) {
      console.error('Failed to load routines:', error);
      showAlert('Error', 'Failed to load routines');
    }
  };

  const loadSession = async (sessionId: string) => {
    try {
      const { data: session, error: sessionError } = await supabase
        .from('workout_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .single();

      if (sessionError) throw sessionError;

      const { data: sessionExercises, error: exercisesError } = await supabase
        .from('session_exercises')
        .select(`
          *,
          session_exercise_sets (*)
        `)
        .eq('session_id', sessionId)
        .order('exercise_order');

      if (exercisesError) throw exercisesError;

      setSessionData(session);
      setSessionNotes(session?.notes || '');
      setNoteDraft(session?.notes || '');
      const loadedSleepHours =
        typeof session?.sleep_hours === 'number'
          ? session.sleep_hours
          : Number.isFinite(Number(session?.sleep_hours))
            ? Number(session.sleep_hours)
            : null;
      const loadedNutrition = normalizeNutrition(session?.nutrition);
      const loadedSupps = Boolean(session?.took_supps);
      setSessionSleepHours(loadedSleepHours);
      setSleepHoursDraft(loadedSleepHours == null ? '' : String(loadedSleepHours));
      setSessionNutrition(loadedNutrition);
      setNutritionDraft(loadedNutrition);
      setSessionSupps(loadedSupps);
      setSuppsDraft(loadedSupps);

      const sessionStart = session?.session_date && session?.start_time
        ? new Date(`${session.session_date}T${session.start_time}`)
        : null;
      const initialTimerOrigin = sessionStart && !Number.isNaN(sessionStart.getTime())
        ? sessionStart.getTime()
        : Date.now();
      clearTimerInterval();
      setTimerOrigin(initialTimerOrigin);
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - initialTimerOrigin) / 1000)));
      setIsTimerRunning(false);

      const transformedExercises: Exercise[] = sessionExercises.map((ex: any) => ({
        id: ex.session_exercise_id,
        name: ex.exercise_name,
        muscleGroup: 'General',
        setCount: ex.session_exercise_sets?.length.toString() || '3',
        sets: ex.session_exercise_sets?.map((set: any) => ({
          setNumber: set.set_number,
          reps: set.reps?.toString() || '',
          weight: set.weight?.toString() || '',
          completed: set.completed || false,
        })) || [],
      }));

      setExercises(transformedExercises);

      const cardioRaw = await AsyncStorage.getItem(sessionCardioStorageKey(sessionId));
      const { rows, routineTemplateId } = parseSessionCardioPayload(cardioRaw);
      setSessionCardio(rows);
      setSessionRoutineTemplateId(routineTemplateId);
    } catch (error) {
      console.error('Failed to load session:', error);
      showAlert('Error', 'Failed to load session');
      await AsyncStorage.removeItem(SESSION_KEY);
      await AsyncStorage.removeItem(sessionCardioStorageKey(sessionId));
      setSessionCardio([]);
      setSessionRoutineTemplateId(null);
      setCurrentSessionId(null);
      await loadRoutines(userId);
    }
  };

  const handleStartSession = async () => {
    if (!selectedRoutine) {
      showAlert('Error', 'Please select a routine');
      return;
    }
    
    if (!userId) {
      showAlert('Not Logged In', 'Please log in first to start a workout session');
      return;
    }

    setLoading(true);
    try {

      const parsedRoutineId = Number(selectedRoutine.id);
      if (!Number.isInteger(parsedRoutineId) || parsedRoutineId <= 0) {
        showAlert('Error', 'Selected routine has an invalid ID.');
        return;
      }
      let routineId = parsedRoutineId;

      const { data: existingRoutine, error: existingRoutineError } = await supabase
        .from('routines')
        .select('routine_id')
        .eq('routine_id', routineId)
        .maybeSingle();

      if (existingRoutineError) {
        throw existingRoutineError;
      }

      if (!existingRoutine) {
        const dayLabel = selectedRoutine.day === 'Custom'
          ? selectedRoutine.customDayName || 'Custom'
          : selectedRoutine.day;

        const { data: createdRoutine, error: createRoutineError } = await supabase
          .from('routines')
          .insert({
            routine_name: selectedRoutine.name,
            description: `${dayLabel} • ${selectedRoutine.exercises.length} exercises`,
            created_at: selectedRoutine.createdAt
              ? new Date(selectedRoutine.createdAt).toISOString()
              : new Date().toISOString(),
            user_id: userId,
          })
          .select('routine_id')
          .single();

        if (createRoutineError) {
          throw createRoutineError;
        }

        if (createdRoutine?.routine_id == null) {
          throw new Error('Routine was created but routine_id is missing');
        }

        routineId = createdRoutine.routine_id;

        const syncedRoutine: Routine = {
          ...selectedRoutine,
          id: String(routineId),
        };
        setSelectedRoutine(syncedRoutine);

        const updatedRoutines = routines.map((routine) =>
          routine.id === selectedRoutine.id ? syncedRoutine : routine
        );
        setRoutines(updatedRoutines);
        await AsyncStorage.setItem('@routines', JSON.stringify(updatedRoutines));
      }
      
      const now = new Date();
      const sessionDate = now.toISOString().split('T')[0];
      const startTime = now.toISOString().split('T')[1].split('.')[0];
      
      const { data: session, error: sessionError } = await supabase
        .from('workout_sessions')
        .insert({
          user_id: userId,
          routine_id: routineId,
          session_name: selectedRoutine.name,
          session_date: sessionDate,
          start_time: startTime,
        })
        .select()
        .single();

      if (sessionError) {
        console.error('Session error:', sessionError);
        throw sessionError;
      }
      

      const sessionExercises = selectedRoutine.exercises.map((ex, index) => ({
        session_id: session.session_id,
        exercise_id: ex.exerciseId || ex.name,
        exercise_name: ex.name,
        exercise_order: index + 1,
      }));


      const { data: createdExercises, error: exercisesError } = await supabase
        .from('session_exercises')
        .insert(sessionExercises)
        .select();

      if (exercisesError) {
        console.error('Exercises error:', exercisesError);
        throw exercisesError;
      }


      // Create sets using saved data if available
      const allSets = createdExercises.flatMap((ex: any, index: number) => {
        const routineEx = selectedRoutine.exercises[index];
        const presetSets = buildPresetSetsFromRoutine(routineEx);

        return presetSets.map((set) => ({
          session_exercise_id: ex.session_exercise_id,
          set_number: set.setNumber,
          weight: set.weight ? parseFloat(set.weight) : null,
          reps: set.reps ? parseInt(set.reps) : null,
          is_warmup: false,
          completed: false,
        }));
      });


      const { error: setsError } = await supabase
        .from('session_exercise_sets')
        .insert(allSets);

      if (setsError) {
        console.error('Sets error:', setsError);
        throw setsError;
      }


      const cardioTpl = (selectedRoutine.cardio ?? []).map(normalizeCardioRow);
      if (cardioTpl.length > 0) {
        const rows = cardioTpl.map((c) => ({ ...c }));
        const payload: SessionCardioPayload = {
          routineTemplateId: selectedRoutine.id,
          rows,
        };
        await AsyncStorage.setItem(
          sessionCardioStorageKey(session.session_id),
          JSON.stringify(payload)
        );
        setSessionCardio(rows);
        setSessionRoutineTemplateId(selectedRoutine.id);
      } else {
        setSessionCardio([]);
        setSessionRoutineTemplateId(null);
        await AsyncStorage.removeItem(sessionCardioStorageKey(session.session_id));
      }

      if (session?.session_id == null) {
        throw new Error('Session was created but session_id is missing');
      }

      const persistedSessionId = String(session.session_id);
      await AsyncStorage.setItem(SESSION_KEY, persistedSessionId);
      setCurrentSessionId(persistedSessionId);

      // Build exercise state directly from routine data so reps/weight are preloaded
      const transformedExercises: Exercise[] = createdExercises.map((ex: any, index: number) => {
        const routineEx = selectedRoutine.exercises[index];
        const sets = buildPresetSetsFromRoutine(routineEx).map((set) => ({
          ...set,
          completed: false,
        }));

        return {
          id: ex.session_exercise_id,
          name: ex.exercise_name,
          muscleGroup: routineEx?.muscleGroup || 'General',
          setCount: sets.length.toString(),
          sets,
        };
      });

      setExercises(transformedExercises);
      setSessionData({
        session_name: session.session_name,
        session_date: session.session_date,
        start_time: session.start_time,
      });
      setSessionNotes('');
      setNoteDraft('');
      setSessionSleepHours(null);
      setSleepHoursDraft('');
      setSessionNutrition('ok');
      setNutritionDraft('ok');
      setSessionSupps(false);
      setSuppsDraft(false);

      const sessionStart =
        session.session_date && session.start_time
          ? new Date(`${session.session_date}T${session.start_time}`)
          : null;
      const initialTimerOrigin =
        sessionStart && !Number.isNaN(sessionStart.getTime())
          ? sessionStart.getTime()
          : Date.now();
      clearTimerInterval();
      setTimerOrigin(initialTimerOrigin);
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - initialTimerOrigin) / 1000)));
      setIsTimerRunning(false);

    } catch (error: any) {
      console.error('Failed to start session:', error);
      showAlert('Error', error.message || 'Failed to start workout session');
    } finally {
      setLoading(false);
    }
  };

  const handleEndSession = async () => {
    if (!currentSessionId) return;

    try {
      const endTime = new Date().toISOString().split('T')[1].split('.')[0];

      await supabase
        .from('workout_sessions')
        .update({ end_time: endTime })
        .eq('session_id', currentSessionId);

      await mergeCardioTemplateIntoRoutines(sessionRoutineTemplateId, sessionCardio);

      await AsyncStorage.removeItem(sessionCardioStorageKey(currentSessionId));
      await AsyncStorage.removeItem(SESSION_KEY);

      setCurrentSessionId(null);
      setExercises([]);
      setSessionCardio([]);
      setSessionRoutineTemplateId(null);
      setSelectedRoutine(null);
      setSessionData(null);
      setSessionNotes('');
      setNoteDraft('');
      setSessionSleepHours(null);
      setSleepHoursDraft('');
      setSessionNutrition('ok');
      setNutritionDraft('ok');
      setSessionSupps(false);
      setSuppsDraft(false);
      setShowNotesModal(false);
      setActiveInputTarget(null);
      clearTimerInterval();
      setTimerOrigin(null);
      setElapsedSeconds(0);
      setIsTimerRunning(false);
      
      await loadRoutines(userId);
    } catch (error) {
      console.error('Failed to end session:', error);
      showAlert('Error', 'Failed to end session');
    }
  };

  const updateSessionCardio = (
    index: number,
    field: 'type' | 'duration' | 'unit' | 'calories',
    value: string
  ) => {
    setSessionCardio((prev) => {
      const next = [...prev];
      if (field === 'unit') {
        next[index] = { ...next[index], unit: value === 'hr' ? 'hr' : 'min' };
      } else if (field === "type") {
        next[index] = { ...next[index], type: normalizeCardioType(value) };
      } else {
        next[index] = { ...next[index], [field]: value };
      }
      if (currentSessionId) {
        const payload: SessionCardioPayload = {
          routineTemplateId: sessionRoutineTemplateId,
          rows: next,
        };
        void AsyncStorage.setItem(
          sessionCardioStorageKey(currentSessionId),
          JSON.stringify(payload)
        );
      }
      return next;
    });
  };

  const handleRemoveExercise = (exerciseId: string) => {
    if (activeInputTarget?.exerciseId === exerciseId) {
      setActiveInputTarget(null);
    }
    setExercises(exercises.filter((ex) => ex.id !== exerciseId));
  };

  const handleAddExercise = async (selectedEx: any) => {
    if (!currentSessionId) return;
    try {
      const { data: createdEx, error: exError } = await supabase
        .from('session_exercises')
        .insert({
          session_id: currentSessionId,
          exercise_id: selectedEx.id,
          exercise_name: selectedEx.name,
          exercise_order: exercises.length + 1,
        })
        .select()
        .single();

      if (exError) throw exError;

      const defaultSets = Array.from({ length: 3 }, (_, i) => ({
        session_exercise_id: createdEx.session_exercise_id,
        set_number: i + 1,
        weight: null,
        reps: null,
        is_warmup: false,
        completed: false,
      }));

      const { error: setsError } = await supabase
        .from('session_exercise_sets')
        .insert(defaultSets);

      if (setsError) throw setsError;

      const newExercise: Exercise = {
        id: createdEx.session_exercise_id,
        name: selectedEx.name,
        muscleGroup: selectedEx.primaryMuscles?.[0] || 'General',
        setCount: '3',
        sets: defaultSets.map((s) => ({
          setNumber: s.set_number,
          reps: '',
          weight: '',
          completed: false,
        })),
      };
      setExercises((prev) => [...prev, newExercise]);
    } catch (error: any) {
      console.error('Failed to add exercise:', error);
      showAlert('Error', 'Failed to add exercise');
    }
  };

  const handleReplaceExercise = async (exerciseId: string, selectedEx: any) => {
    try {
      await supabase
        .from('session_exercises')
        .update({
          exercise_id: selectedEx.id,
          exercise_name: selectedEx.name,
        })
        .eq('session_exercise_id', exerciseId);

      setExercises((prev) =>
        prev.map((ex) =>
          ex.id === exerciseId
            ? { ...ex, name: selectedEx.name, muscleGroup: selectedEx.primaryMuscles?.[0] || 'General' }
            : ex
        )
      );
    } catch (error: any) {
      console.error('Failed to replace exercise:', error);
      showAlert('Error', 'Failed to replace exercise');
    }
  };

  const handleExerciseSelected = async (selectedEx: any) => {
    setShowExerciseModal(false);
    if (replaceExerciseId) {
      await handleReplaceExercise(replaceExerciseId, selectedEx);
    } else {
      await handleAddExercise(selectedEx);
    }
    setReplaceExerciseId(null);
  };

  const handleAddSet = async (exerciseId: string) => {
    try {
      const exercise = exercises.find((ex) => ex.id === exerciseId);
      if (!exercise) return;

      const newSetNumber = exercise.sets.length + 1;

      const { error } = await supabase
        .from('session_exercise_sets')
        .insert({
          session_exercise_id: exerciseId,
          set_number: newSetNumber,
          weight: null,
          reps: null,
          is_warmup: false,
          completed: false,
        });

      if (error) throw error;

      setExercises((prev) =>
        prev.map((ex) =>
          ex.id === exerciseId
            ? {
                ...ex,
                setCount: (ex.sets.length + 1).toString(),
                sets: [
                  ...ex.sets,
                  {
                    setNumber: newSetNumber,
                    reps: '',
                    weight: '',
                    completed: false,
                  },
                ],
              }
            : ex
        )
      );
    } catch (error) {
      console.error('Failed to add set:', error);
      showAlert('Error', 'Failed to add set');
    }
  };

  const handleRemoveSet = async (exerciseId: string) => {
    try {
      const exercise = exercises.find((ex) => ex.id === exerciseId);
      if (!exercise) return;

      if (exercise.sets.length <= 1) {
        showAlert('Minimum Reached', 'Each exercise needs at least 1 set.');
        return;
      }

      const lastSetNumber = exercise.sets.length;

      const { error } = await supabase
        .from('session_exercise_sets')
        .delete()
        .eq('session_exercise_id', exerciseId)
        .eq('set_number', lastSetNumber);

      if (error) throw error;

      setExercises((prev) =>
        prev.map((ex) =>
          ex.id === exerciseId
            ? {
                ...ex,
                setCount: (ex.sets.length - 1).toString(),
                sets: ex.sets.slice(0, -1),
              }
            : ex
        )
      );

      if (activeInputTarget?.exerciseId === exerciseId && activeInputTarget.setNumber >= lastSetNumber) {
        setActiveInputTarget((prev) =>
          prev
            ? {
                ...prev,
                setNumber: Math.max(1, lastSetNumber - 1),
              }
            : prev
        );
      }
    } catch (error) {
      console.error('Failed to remove set:', error);
      showAlert('Error', 'Failed to remove set');
    }
  };

  const handleUpdateSet = async (exerciseId: string, setNumber: number, field: string, value: any) => {
    setExercises(
      exercises.map((exercise) => {
        if (exercise.id === exerciseId) {
          return {
            ...exercise,
            sets: exercise.sets.map((set) =>
              set.setNumber === setNumber ? { ...set, [field]: value } : set
            ),
          };
        }
        return exercise;
      })
    );

    try {
      const exercise = exercises.find(ex => ex.id === exerciseId);
      if (!exercise) return;

      const { data: setData, error } = await supabase
        .from('session_exercise_sets')
        .select('session_set_id')
        .eq('session_exercise_id', exerciseId)
        .eq('set_number', setNumber)
        .single();

      if (error || !setData) {
        console.error('Failed to find set:', error);
        return;
      }

      await supabase
        .from('session_exercise_sets')
        .update({ [field]: value })
        .eq('session_set_id', setData.session_set_id);
    } catch (error) {
      console.error('Failed to update set:', error);
    }
  };

  const handleToggleSet = async (exerciseId: string, setNumber: number) => {
    const exercise = exercises.find(ex => ex.id === exerciseId);
    if (!exercise) return;

    const set = exercise.sets.find(s => s.setNumber === setNumber);
    if (!set) return;

    const newCompleted = !set.completed;

    setExercises(
      exercises.map((exercise) => {
        if (exercise.id === exerciseId) {
          return {
            ...exercise,
            sets: exercise.sets.map((s) =>
              s.setNumber === setNumber
                ? { ...s, completed: newCompleted }
                : s
            ),
          };
        }
        return exercise;
      })
    );

    try {
      const { data: setData, error } = await supabase
        .from('session_exercise_sets')
        .select('session_set_id')
        .eq('session_exercise_id', exerciseId)
        .eq('set_number', setNumber)
        .single();

      if (error || !setData) {
        console.error('Failed to find set:', error);
        return;
      }

      await supabase
        .from('session_exercise_sets')
        .update({
          completed: newCompleted,
          reps: newCompleted ? (parseInt(set.reps) || null) : null,
          weight: newCompleted ? (parseFloat(set.weight) || null) : null,
        })
        .eq('session_set_id', setData.session_set_id);
    } catch (error) {
      console.error('Failed to save set:', error);
    }
  };

  const handleSignOut = async () => {
    try {
      await AsyncStorage.removeItem('userId');
      const sid = await AsyncStorage.getItem(SESSION_KEY);
      if (sid) await AsyncStorage.removeItem(sessionCardioStorageKey(sid));
      await AsyncStorage.removeItem(SESSION_KEY);

      await supabase.auth.signOut();

      setUserId(null);
      setCurrentSessionId(null);
      setExercises([]);
      setRoutines([]);
      setSelectedRoutine(null);
      setSessionCardio([]);
      setSessionRoutineTemplateId(null);
      setSessionData(null);
      setSessionNotes('');
      setNoteDraft('');
      setSessionSleepHours(null);
      setSleepHoursDraft('');
      setSessionNutrition('ok');
      setNutritionDraft('ok');
      setSessionSupps(false);
      setSuppsDraft(false);
      setShowNotesModal(false);
      setActiveInputTarget(null);
      clearTimerInterval();
      setTimerOrigin(null);
      setElapsedSeconds(0);
      setIsTimerRunning(false);
      
      showAlert('Signed Out', 'You have been signed out successfully');
    } catch (error) {
      console.error('Failed to sign out:', error);
      showAlert('Error', 'Failed to sign out');
    }
  };

  useEffect(() => {
    if (!activeInputTarget) return;

    const exercise = exercises.find((ex) => ex.id === activeInputTarget.exerciseId);
    const layout = cardLayoutMapRef.current[activeInputTarget.exerciseId];
    if (!exercise || !layout) return;

    const setIndex = exercise.sets.findIndex((set) => set.setNumber === activeInputTarget.setNumber);
    if (setIndex < 0) return;

    //Adjusts based on current set    
    const cardTopPadding = 110;
    const perSetRowHeight = 46;
    const targetY = Math.max(0, layout.y + cardTopPadding + (setIndex * perSetRowHeight) - 20);

    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
    });
  }, [activeInputTarget, exercises]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0066CC" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!currentSessionId) {
    return (
      <SafeAreaView style={styles.container}>
        <LinearGradient
          colors={['#0066CC', '#4A9EFF']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.selectionTitle}>Start a Workout</Text>
              <Text style={styles.selectionSubtitle}>Select a routine to begin</Text>
            </View>
            <TouchableOpacity
              style={styles.signOutButton}
              onPress={handleSignOut}>
              <Text style={styles.signOutButtonText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <ScrollView style={styles.routineSelectionContainer}>
          {routines.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No routines found</Text>
              <Text style={styles.emptyStateSubtext}>
                Create a routine first in the Routines tab
              </Text>
            </View>
          ) : (
            routines.map((routine) => (
              <TouchableOpacity
                key={routine.id}
                style={[
                  styles.routineCard,
                  selectedRoutine?.id === routine.id && styles.routineCardSelected,
                ]}
                onPress={() => setSelectedRoutine(routine)}>
                <View style={styles.routineCardContent}>
                  <Text style={styles.routineCardName}>{routine.name}</Text>
                  <Text style={styles.routineCardInfo}>
                    {routine.exercises.length} exercises
                  </Text>
                  {selectedRoutine?.id === routine.id && (
                    <Text style={styles.selectedCheckmark}>✓ Selected</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>

        {selectedRoutine && (
          <View style={styles.startButtonContainer}>
            <TouchableOpacity
              style={styles.startButton}
              onPress={handleStartSession}
              disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.startButtonText}>Start Workout</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    );
  }

  const completedSets = exercises.reduce(
    (acc, ex) => acc + ex.sets.filter((s) => s.completed).length,
    0
  );
  const totalSets = exercises.reduce((acc, ex) => acc + ex.sets.length, 0);
  const progress = totalSets > 0 ? (completedSets / totalSets) * 100 : 0;

  const openNotesModal = () => {
    setNoteDraft(sessionNotes);
    setSleepHoursDraft(sessionSleepHours == null ? '' : String(sessionSleepHours));
    setNutritionDraft(sessionNutrition);
    setSuppsDraft(sessionSupps);
    setShowNotesModal(true);
  };

  const handleSaveNotes = async () => {
    if (!currentSessionId) return;

    const normalizedNotes = noteDraft.trim();
    const normalizedSleepHoursInput = sleepHoursDraft.trim();
    const parsedSleepHours =
      normalizedSleepHoursInput === '' ? null : parseInt(normalizedSleepHoursInput, 10);

    if (
      normalizedSleepHoursInput !== '' &&
      (Number.isNaN(parsedSleepHours) || (parsedSleepHours as number) < 0 || (parsedSleepHours as number) > 24)
    ) {
      showAlert('Invalid Sleep', 'Sleep hours must be a whole number between 0 and 24.');
      return;
    }

    setSavingNote(true);
    try {
      const { error } = await supabase
        .from('workout_sessions')
        .update({
          notes: normalizedNotes || null,
          sleep_hours: parsedSleepHours,
          nutrition: nutritionDraft,
          took_supps: suppsDraft,
        })
        .eq('session_id', currentSessionId);

      if (error) throw error;

      setSessionNotes(normalizedNotes);
      setSessionSleepHours(parsedSleepHours);
      setSessionNutrition(nutritionDraft);
      setSessionSupps(suppsDraft);
      setSessionData((prev: SessionData | null) => (
        prev
          ? {
              ...prev,
              notes: normalizedNotes || null,
              sleep_hours: parsedSleepHours,
              nutrition: nutritionDraft,
              took_supps: suppsDraft,
            }
          : prev
      ));
      setShowNotesModal(false);
    } catch (error: any) {
      console.error('Failed to save notes:', error);
      showAlert('Error', error.message || 'Failed to save workout note');
    } finally {
      setSavingNote(false);
    }
  };

  const handleResetTimer = () => {
    clearTimerInterval();
    setTimerOrigin(Date.now());
    setElapsedSeconds(0);
    setIsTimerRunning(false);
  };

  const handleToggleTimer = () => {
    if (isTimerRunning) {
      pauseTimer();
      return;
    }

    startTimer(Date.now() - (elapsedSeconds * 1000));
  };

  const handleFocusExerciseCard = (exerciseId: string) => {
    setFocusedExerciseId(exerciseId);
    setActiveInputTarget(null);
  };

  const handleActiveTargetChange = (exerciseId: string, setNumber: number, field: 'reps' | 'weight') => {
    setActiveInputTarget((prev) => {
      if (
        prev &&
        prev.exerciseId === exerciseId &&
        prev.setNumber === setNumber &&
        prev.field === field
      ) {
        return prev;
      }

      return { exerciseId, setNumber, field };
    });
  };

  const adjustActiveInputValue = async (direction: 'inc' | 'dec') => {
    if (!activeInputTarget) return;

    const exercise = exercises.find((ex) => ex.id === activeInputTarget.exerciseId);
    const targetSet = exercise?.sets.find((set) => set.setNumber === activeInputTarget.setNumber);
    if (!exercise || !targetSet || targetSet.completed) return;

    const isReps = activeInputTarget.field === 'reps';
    const step = isReps ? 1 : 5;
    const min = 0;
    const max = isReps ? 50 : 500;
    const parsed = parseInt(targetSet[activeInputTarget.field] || '0', 10);
    const currentValue = Number.isFinite(parsed) ? parsed : 0;
    const nextValue = direction === 'inc' ? currentValue + step : currentValue - step;
    const clampedValue = Math.max(min, Math.min(max, nextValue));

    await handleUpdateSet(
      activeInputTarget.exerciseId,
      activeInputTarget.setNumber,
      activeInputTarget.field,
      clampedValue.toString()
    );
  };

  const moveActiveInputTarget = (direction: 'left' | 'up' | 'down' | 'right') => {
    if (!activeInputTarget) return;

    const exerciseIndex = exercises.findIndex((ex) => ex.id === activeInputTarget.exerciseId);
    if (exerciseIndex < 0) return;

    const exercise = exercises[exerciseIndex];
    if (!exercise || exercise.sets.length === 0) return;

    const currentSetIndex = exercise.sets.findIndex((set) => set.setNumber === activeInputTarget.setNumber);
    if (currentSetIndex < 0) return;

    let nextExerciseId = activeInputTarget.exerciseId;
    let nextSetNumber = activeInputTarget.setNumber;
    let nextField = activeInputTarget.field;

    if (direction === 'left' || direction === 'right') {
      nextField = direction === 'left' ? 'reps' : 'weight';
    } else {
      const delta = direction === 'down' ? 1 : -1;
      const tentativeIndex = currentSetIndex + delta;

      if (tentativeIndex < 0) {
        const prevExercise = exercises[exerciseIndex - 1];
        if (!prevExercise || prevExercise.sets.length === 0) return;
        nextExerciseId = prevExercise.id;
        nextSetNumber = prevExercise.sets[prevExercise.sets.length - 1].setNumber;
      } else if (tentativeIndex >= exercise.sets.length) {
        const followingExercise = exercises[exerciseIndex + 1];
        if (!followingExercise || followingExercise.sets.length === 0) return;
        nextExerciseId = followingExercise.id;
        nextSetNumber = followingExercise.sets[0].setNumber;
      } else {
        const nextSet = exercise.sets[tentativeIndex];
        if (!nextSet) return;
        nextSetNumber = nextSet.setNumber;
      }
    }

    if (
      nextExerciseId === activeInputTarget.exerciseId &&
      nextSetNumber === activeInputTarget.setNumber &&
      nextField === activeInputTarget.field
    ) {
      return;
    }

    setActiveInputTarget((prev) => {
      if (!prev) return prev;
      if (
        prev.exerciseId === nextExerciseId &&
        prev.setNumber === nextSetNumber &&
        prev.field === nextField
      ) {
        return prev;
      }

      return {
        ...prev,
        exerciseId: nextExerciseId,
        setNumber: nextSetNumber,
        field: nextField,
      };
    });
    setFocusedExerciseId(nextExerciseId);
  };

  const handleCardLayout = (exerciseId: string, y: number, height: number) => {
    cardLayoutMapRef.current[exerciseId] = { y, height };
  };

  const activeValue = activeInputTarget
    ? exercises
        .find((ex) => ex.id === activeInputTarget.exerciseId)
        ?.sets.find((s) => s.setNumber === activeInputTarget.setNumber)
        ?.[activeInputTarget.field] ?? ''
    : '';

  const fieldKey = activeInputTarget
    ? `${activeInputTarget.exerciseId}_${activeInputTarget.setNumber}_${activeInputTarget.field}`
    : '';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        scrollEnabled={true}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, focusedExerciseId && activeInputTarget ? styles.scrollContentWithKeyboard : undefined]}
        keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={[1]}>
        
        <LinearGradient
          colors={['#0066CC', '#4A9EFF']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}>
          <View style={styles.dateTimeContainer}>
            <View>
              <Text style={styles.dateText}>{getTodaysDate()}</Text>
              <Text style={styles.timeText}>{getCurrentTime()}</Text>
            </View>
            <View style={styles.progressBadge}>
              <Text style={styles.progressBadgeText}>
                {completedSets}/{totalSets}
              </Text>
            </View>
          </View>
          
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
        </LinearGradient>

        <View style={styles.stickyTimerWrapper}>
          <View style={styles.timerCard}>
            <View>
              <Text style={styles.timerLabel}>Workout Timer</Text>
              <Text style={styles.timerValue}>{formatElapsedTime(elapsedSeconds)}</Text>
            </View>
            <View style={styles.timerActions}>
              <TouchableOpacity
                style={[styles.timerToggleButton, isTimerRunning ? styles.timerPauseButton : styles.timerStartButton]}
                onPress={handleToggleTimer}>
                <Text style={styles.timerToggleButtonText}>{isTimerRunning ? 'Pause' : 'Start'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.timerResetButton}
                onPress={handleResetTimer}>
                <Text style={styles.timerResetButtonText}>Reset</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View
          style={styles.exercisesContainer}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{sessionData?.session_name || 'Workout'}</Text>
            <View style={styles.headerButtons}>
              <TouchableOpacity
                style={styles.noteButton}
                onPress={openNotesModal}>
                <Text style={styles.noteButtonText}>
                  {sessionNotes ? 'Edit Note' : 'Add Note'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.endSessionButton}
                onPress={handleEndSession}>
                <Text style={styles.endSessionButtonText}>End Workout</Text>
              </TouchableOpacity>
            </View>
          </View>

          {sessionCardio.length > 0 && (
            <View style={styles.cardioSessionSection}>
              <Text style={styles.cardioSessionTitle}>Cardio today</Text>
              <Text style={styles.cardioSessionHint}>
                Log minutes or hours; values save to this routine for next time when you end the workout.
              </Text>
              {sessionCardio.map((row, idx) => (
                <View
                  key={row.id}
                  style={[
                    styles.cardioSessionRow,
                    idx === sessionCardio.length - 1 && styles.cardioSessionRowLast,
                  ]}>
                  <Text style={styles.cardioSessionName} numberOfLines={1}>{row.type}</Text>
                  <View style={styles.cardioSessionInputs}>
                    <TextInput
                      style={styles.cardioSessionDurationInput}
                      value={row.duration}
                      onChangeText={(t) => updateSessionCardio(idx, 'duration', t)}
                      placeholder="Duration"
                      placeholderTextColor="#444"
                      keyboardType="numeric"
                    />
                    <TextInput
                      style={styles.cardioSessionDurationInput}
                      value={row.calories}
                      onChangeText={(t) => updateSessionCardio(idx, 'calories', t)}
                      placeholder="Calories"
                      placeholderTextColor="#444"
                      keyboardType="numeric"
                    />
                    <View style={styles.cardioSessionUnitToggle}>
                      <TouchableOpacity
                        style={[
                          styles.cardioSessionUnitChip,
                          row.unit === 'min' && styles.cardioSessionUnitChipActive,
                        ]}
                        onPress={() => updateSessionCardio(idx, 'unit', 'min')}>
                        <Text
                          style={[
                            styles.cardioSessionUnitChipText,
                            row.unit === 'min' && styles.cardioSessionUnitChipTextActive,
                          ]}>
                          min
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.cardioSessionUnitChip,
                          row.unit === 'hr' && styles.cardioSessionUnitChipActive,
                        ]}
                        onPress={() => updateSessionCardio(idx, 'unit', 'hr')}>
                        <Text
                          style={[
                            styles.cardioSessionUnitChipText,
                            row.unit === 'hr' && styles.cardioSessionUnitChipTextActive,
                          ]}>
                          hr
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.cardioSessionTypeGrid}>
                    {CARDIO_TYPES.map((type) => (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.cardioSessionTypeChip,
                          row.type === type && styles.cardioSessionTypeChipActive,
                        ]}
                        onPress={() => updateSessionCardio(idx, "type", type)}>
                        <Text
                          style={[
                            styles.cardioSessionTypeChipText,
                            row.type === type && styles.cardioSessionTypeChipTextActive,
                          ]}>
                          {type}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}

          {exercises.map((exercise) => (
            <ExerciseCard
              key={exercise.id}
              exercise={exercise}
              isFocused={focusedExerciseId === exercise.id}
              onFocus={handleFocusExerciseCard}
              onCardLayout={handleCardLayout}
              focusedSetNumber={
                activeInputTarget?.exerciseId === exercise.id ? activeInputTarget.setNumber : undefined
              }
              focusedField={
                activeInputTarget?.exerciseId === exercise.id ? activeInputTarget.field : undefined
              }
              onRemove={handleRemoveExercise}
              onUpdateSet={(setNum: number, field: 'reps' | 'weight', value: string) =>
                handleUpdateSet(exercise.id, setNum, field, value)
              }
              onToggleSet={handleToggleSet}
              onAddSet={handleAddSet}
              onRemoveSet={handleRemoveSet}
              onActiveTargetChange={handleActiveTargetChange}
              onReplace={(id) => {
                setReplaceExerciseId(id);
                setShowExerciseModal(true);
              }}
            />
          ))}

          {exercises.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No exercises in this routine</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.addExerciseButton}
            onPress={() => {
              setReplaceExerciseId(null);
              setShowExerciseModal(true);
            }}>
            <Text style={styles.addExerciseButtonText}>+ Add Exercise</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <WorkoutKeyboard
        visible={!!(focusedExerciseId && activeInputTarget)}
        value={activeValue}
        field={activeInputTarget?.field ?? 'reps'}
        fieldKey={fieldKey}
        onValueChange={(val) => {
          if (!activeInputTarget) return;
          handleUpdateSet(
            activeInputTarget.exerciseId,
            activeInputTarget.setNumber,
            activeInputTarget.field,
            val,
          );
        }}
        onStepUp={() => adjustActiveInputValue('inc')}
        onStepDown={() => adjustActiveInputValue('dec')}
        onMoveLeft={() => moveActiveInputTarget('left')}
        onMoveUp={() => moveActiveInputTarget('up')}
        onMoveDown={() => moveActiveInputTarget('down')}
        onMoveRight={() => moveActiveInputTarget('right')}
        onDone={() => setActiveInputTarget(null)}
      />

      <ExerciseSearchModal
        visible={showExerciseModal}
        title={replaceExerciseId ? 'Replace Exercise' : 'Add Exercise'}
        onClose={() => {
          setShowExerciseModal(false);
          setReplaceExerciseId(null);
        }}
        onSelect={handleExerciseSelected}
      />

      <Modal
        visible={showNotesModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNotesModal(false)}>
        <KeyboardAvoidingView
          style={styles.noteModalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.noteModalCard}>
            <View style={styles.noteModalHeader}>
              <Text style={styles.noteModalTitle}>Workout Note</Text>
              <TouchableOpacity
                onPress={() => setShowNotesModal(false)}
                disabled={savingNote}>
                <Text style={styles.noteModalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.noteModalHint}>
              Save notes anytime during your workout.
            </Text>

            <TextInput
              style={styles.noteInput}
              value={noteDraft}
              onChangeText={setNoteDraft}
              placeholder="Add your notes here..."
              placeholderTextColor="#666"
              multiline
              textAlignVertical="top"
              editable={!savingNote}
            />

            <View style={styles.noteFieldBlock}>
              <Text style={styles.noteFieldLabel}>Sleep Last Night (hrs)</Text>
              <TextInput
                style={styles.smallInput}
                value={sleepHoursDraft}
                onChangeText={setSleepHoursDraft}
                placeholder="e.g. 8"
                placeholderTextColor="#666"
                keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                editable={!savingNote}
                maxLength={2}
              />
            </View>

            <View style={styles.noteFieldBlock}>
              <Text style={styles.noteFieldLabel}>Today&apos;s Nutrition</Text>
              <View style={styles.nutritionPillsRow}>
                {(['good', 'ok', 'bad'] as NutritionQuality[]).map((level) => {
                  const selected = nutritionDraft === level;
                  return (
                    <TouchableOpacity
                      key={level}
                      style={[
                        styles.nutritionPill,
                        selected && styles.nutritionPillSelected,
                      ]}
                      onPress={() => setNutritionDraft(level)}
                      disabled={savingNote}>
                      <Text
                        style={[
                          styles.nutritionPillText,
                          selected && styles.nutritionPillTextSelected,
                        ]}>
                        {level.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.noteFieldBlock}>
              <TouchableOpacity
                style={styles.suppsToggleRow}
                onPress={() => setSuppsDraft((prev) => !prev)}
                disabled={savingNote}>
                <View style={[styles.suppsCheckbox, suppsDraft && styles.suppsCheckboxChecked]}>
                  {suppsDraft && <Text style={styles.suppsCheckmark}>✓</Text>}
                </View>
                <Text style={styles.suppsLabel}>Took daily supplements</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.noteModalActions}>
              <TouchableOpacity
                style={styles.noteSecondaryButton}
                onPress={() => setNoteDraft('')}
                disabled={savingNote}>
                <Text style={styles.noteSecondaryButtonText}>Clear</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.notePrimaryButton, savingNote && styles.notePrimaryButtonDisabled]}
                onPress={handleSaveNotes}
                disabled={savingNote}>
                {savingNote ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.notePrimaryButtonText}>Save Note</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollContent: {
    paddingBottom: 180,
  },
  scrollContentWithKeyboard: {
    paddingBottom: 400,
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 20 : 40,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  dateTimeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
    opacity: 0.9,
  },
  timeText: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.7,
    marginTop: 4,
  },
  progressBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  progressBadgeText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  focusedExerciseCard: {
    borderWidth: 2,
    borderColor: '#0066CC',
  },
  activeInput: {
    borderColor: '#0066CC',
    borderWidth: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
  },
  exercisesContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  stickyTimerWrapper: {
    backgroundColor: '#000000',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardioSessionSection: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A4A6A',
  },
  cardioSessionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  cardioSessionHint: {
    fontSize: 12,
    color: '#888',
    marginBottom: 12,
    lineHeight: 17,
  },
  cardioSessionRow: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  cardioSessionRowLast: {
    marginBottom: 0,
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  cardioSessionName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  cardioSessionInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  cardioSessionDurationInput: {
    flex: 1,
    backgroundColor: '#000000',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: '#FFFFFF',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  cardioSessionUnitToggle: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#333',
  },
  cardioSessionUnitChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#000000',
  },
  cardioSessionUnitChipActive: {
    backgroundColor: '#0066CC',
  },
  cardioSessionUnitChipText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
  cardioSessionUnitChipTextActive: {
    color: '#FFFFFF',
  },
  cardioSessionTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cardioSessionTypeChip: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#000000',
  },
  cardioSessionTypeChipActive: {
    borderColor: '#0066CC',
    backgroundColor: '#0066CC',
  },
  cardioSessionTypeChipText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
  },
  cardioSessionTypeChipTextActive: {
    color: '#FFFFFF',
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  iconButton: {
    backgroundColor: '#1A1A1A',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  iconButtonText: {
    fontSize: 20,
  },
  exerciseCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  exerciseHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  chevron: {
    color: '#0066CC',
    fontSize: 16,
    marginRight: 8,
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  exerciseMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  setCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000',
    borderRadius: 4,
    paddingHorizontal: 4,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  setCountInput: {
    color: '#0066CC',
    fontSize: 12,
    fontWeight: '600',
    padding: 2,
    width: 24,
    textAlign: 'center',
  },
  setCountValue: {
    color: '#0066CC',
    fontSize: 12,
    fontWeight: '700',
    marginRight: 4,
    minWidth: 18,
    textAlign: 'center',
  },
  setAdjustControls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    gap: 6,
  },
  setAdjustButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#444',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  setAdjustButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 15,
  },
  exerciseMeta: {
    fontSize: 12,
    color: '#888',
    marginRight: 8,
  },
  completedBadge: {
    fontSize: 12,
    color: '#4CAF50',
  },
  removeButton: {
    padding: 4,
  },
  removeIcon: {
    color: '#0066CC',
    fontSize: 20,
    fontWeight: 'bold',
  },
  exerciseActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  replaceButton: {
    padding: 4,
  },
  replaceIcon: {
    color: '#888',
    fontSize: 20,
    fontWeight: 'bold',
  },
  addExerciseButton: {
    borderWidth: 1,
    borderColor: '#0066CC',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  addExerciseButtonText: {
    color: '#0066CC',
    fontSize: 15,
    fontWeight: '600',
  },
  setsTable: {
    borderTopWidth: 1,
    borderTopColor: '#333',
    padding: 16,
    backgroundColor: '#121212',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  tableHeader: {
    flexDirection: 'row',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  checkboxPlaceholder: {
    width: 24,
    marginRight: 8,
  },
  tableHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
  },
  setRow: {
    flexDirection: 'row',
    marginBottom: 10,
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  setRowActive: {
    backgroundColor: 'rgba(0, 102, 204, 0.12)',
  },
  setRowCompleted: {
    opacity: 0.6,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#0066CC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  checkboxCompleted: {
    backgroundColor: '#0066CC',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  setNumberCell: {
    width: 40,
    alignItems: 'flex-start',
  },
  setInputCell: {
    flex: 1,
    alignItems: 'center',
  },
  setNumberText: {
    fontSize: 14,
    color: '#888',
  },
  setInput: {
    backgroundColor: '#000000',
    borderRadius: 8,
    width: '80%',
    height: 40,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  setInputText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  inputCompleted: {
    opacity: 0.5,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    color: '#888',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    color: '#666',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    height: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  closeButton: {
    color: '#0066CC',
    fontSize: 24,
  },
  routineListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    marginBottom: 12,
  },
  routineListItemSelected: {
    borderColor: '#0066CC',
    backgroundColor: 'rgba(0,102,204,0.1)',
  },
  routineListItemContent: {
    flex: 1,
  },
  routineListItemName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  routineListItemDay: {
    fontSize: 14,
    color: '#888',
  },
  addButton: {
    backgroundColor: '#0066CC',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  selectionTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  selectionSubtitle: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.8,
  },
  signOutButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  signOutButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  routineSelectionContainer: {
    flex: 1,
    padding: 16,
  },
  routineCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#333',
  },
  routineCardSelected: {
    borderColor: '#0066CC',
    backgroundColor: 'rgba(0,102,204,0.1)',
  },
  routineCardContent: {
    gap: 8,
  },
  routineCardName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  routineCardInfo: {
    fontSize: 14,
    color: '#888',
  },
  selectedCheckmark: {
    fontSize: 14,
    color: '#0066CC',
    fontWeight: '600',
    marginTop: 4,
  },
  startButtonContainer: {
    padding: 16,
    backgroundColor: '#000000',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  startButton: {
    backgroundColor: '#0066CC',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  endSessionButton: {
    backgroundColor: '#0066CC',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  endSessionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  noteButton: {
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  noteButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  notePreviewCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    padding: 14,
    marginBottom: 12,
  },
  notePreviewLabel: {
    color: '#0066CC',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  notePreviewText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
  },
  timerCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timerLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  timerValue: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 1,
  },
  timerToggleButton: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 76,
    alignItems: 'center',
  },
  timerStartButton: {
    backgroundColor: '#0066CC',
  },
  timerPauseButton: {
    backgroundColor: '#333333',
  },
  timerToggleButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  timerResetButton: {
    backgroundColor: '#000000',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  timerResetButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  bottomAdjusterContainer: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: Platform.OS === 'ios' ? 0 : 78,
    backgroundColor: '#121212',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  bottomAdjusterLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  bottomAdjusterActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bottomAdjusterButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomAdjusterButtonText: {
    color: '#FFFFFF',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
  },
  noteModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  noteModalCard: {
    backgroundColor: '#121212',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#333',
    padding: 20,
  },
  noteModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  noteModalTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  noteModalClose: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  noteModalHint: {
    color: '#888',
    fontSize: 14,
    marginBottom: 16,
  },
  noteInput: {
    minHeight: 140,
    backgroundColor: '#000000',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    color: '#FFFFFF',
    fontSize: 15,
    padding: 14,
    marginBottom: 16,
  },
  noteFieldBlock: {
    marginBottom: 14,
  },
  noteFieldLabel: {
    color: '#888',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  smallInput: {
    height: 48,
    backgroundColor: '#000000',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    color: '#FFFFFF',
    fontSize: 16,
    paddingHorizontal: 14,
  },
  nutritionPillsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  nutritionPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
  },
  nutritionPillSelected: {
    borderColor: '#0066CC',
    backgroundColor: 'rgba(0, 102, 204, 0.2)',
  },
  nutritionPillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  nutritionPillTextSelected: {
    color: '#9CCBFF',
  },
  suppsToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  suppsCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#333',
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  suppsCheckboxChecked: {
    borderColor: '#0066CC',
    backgroundColor: '#0066CC',
  },
  suppsCheckmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  suppsLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  noteModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  noteSecondaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333',
  },
  noteSecondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  notePrimaryButton: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#0066CC',
    minWidth: 108,
    alignItems: 'center',
  },
  notePrimaryButtonDisabled: {
    opacity: 0.7,
  },
  notePrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});