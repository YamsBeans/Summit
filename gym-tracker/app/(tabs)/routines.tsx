// app/(tabs)/routines.tsx
import React, { useState, useEffect } from 'react';
import ExerciseSearchModal from '@/components/ExerciseSearchModal';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  Modal,
  TextInput,
  SafeAreaView,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Routine, RoutineCardio, RoutineExercise } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { supabase } from '@/backend/supabaseClient';

const STORAGE_KEY = '@routines';
const CARDIO_TYPES: RoutineCardio["type"][] = [
  "bike",
  "treadmill",
  "stair-master",
  "elliptical",
  "running",
  "other",
];

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

type RoutineCardProps = {
  routine: Routine;
  onDelete: (routineId: string) => void;
  onUse: (routine: Routine) => void;
  onEdit: (routine: Routine) => void;
};

type CreateEditRoutineModalProps = {
  visible: boolean;
  onClose: () => void;
  onSave: (routine: Routine) => void | Promise<void>;
  editingRoutine: Routine | null;
};

// Routine Card Component with Edit and Delete
const RoutineCard = ({ routine, onDelete, onUse, onEdit }: RoutineCardProps) => {
  const [expanded, setExpanded] = useState(false);

  const handleDelete = () => {
    onDelete(routine.id);
  };

  return (
    <View style={styles.routineCard}>
      <View style={styles.routineHeader}>
        <TouchableOpacity
          style={styles.routineHeaderLeft}
          onPress={() => setExpanded(!expanded)}
          activeOpacity={0.7}>
          <Text style={styles.chevron}>{expanded ? '▼' : '▶'}</Text>
          <View>
            <Text style={styles.routineName}>{routine.name}</Text>
            <Text style={styles.routineDay}>
              {routine.day === 'Custom' ? routine.customDayName : routine.day}
            </Text>
          </View>
        </TouchableOpacity>
        <View style={styles.routineHeaderRight}>
          <Text style={styles.exerciseCount}>
            {routine.exercises.length} exercises
            {(routine.cardio?.length ?? 0) > 0 ? ` · ${routine.cardio!.length} cardio` : ''}
          </Text>
          <View style={styles.actionButtons}>
            <TouchableOpacity onPress={() => onEdit(routine)} style={styles.editButton}>
              <Text style={styles.editButtonText}>✎</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
              <Text style={styles.deleteButtonText}>🗑</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onUse(routine)} style={styles.useButton}>
              <Text style={styles.useButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {expanded && (
        <View style={styles.routineExercises}>
          {routine.exercises.map((exercise, index) => (
            <View key={index} style={styles.routineExerciseItem}>
              <View style={styles.routineExerciseInfo}>
                <Text style={styles.routineExerciseName}>{exercise.name}</Text>
                <Text style={styles.routineExerciseMeta}>
                  {exercise.muscleGroup} • {exercise.sets?.length || exercise.defaultSetCount} sets
                </Text>
              </View>
              
              {/* Show saved sets if they exist */}
              {exercise.sets && exercise.sets.length > 0 && (
                <View style={styles.savedSetsContainer}>
                  <View style={styles.savedSetsHeader}>
                    <Text style={styles.savedSetsHeaderText}>Set</Text>
                    <Text style={styles.savedSetsHeaderText}>Reps</Text>
                    <Text style={styles.savedSetsHeaderText}>Weight</Text>
                  </View>
                  {exercise.sets.map((set) => (
                    <View key={set.setNumber} style={styles.savedSetRow}>
                      <Text style={styles.savedSetText}>{set.setNumber}</Text>
                      <Text style={styles.savedSetText}>{set.reps || '—'}</Text>
                      <Text style={styles.savedSetText}>{set.weight || '—'}</Text>
                    </View>
                  ))}
                </View>
              )}
              
              {exercise.notes && (
                <Text style={styles.routineExerciseNotes}>{exercise.notes}</Text>
              )}
            </View>
          ))}
          {(routine.cardio?.length ?? 0) > 0 && (
            <View style={styles.routineCardioBlock}>
              <Text style={styles.routineCardioTitle}>Cardio</Text>
              {routine.cardio!.map((c: RoutineCardio) => (
                <View key={c.id} style={styles.routineCardioRow}>
                  <Text style={styles.routineCardioName}>{c.type}</Text>
                  <Text style={styles.routineCardioMeta}>
                    {c.duration || '—'} {c.unit === 'hr' ? 'hr' : 'min'} · {c.calories || '—'} cal
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const MAX_ROUTINE_WEIGHT_LBS = 1150;

function clampRoutineWeightInput(text: string): string {
  if (text === '') return '';
  let t = text.replace(/[^\d.]/g, '');
  const firstDot = t.indexOf('.');
  if (firstDot !== -1) {
    t = t.slice(0, firstDot + 1) + t.slice(firstDot + 1).replace(/\./g, '');
  }
  if (t === '' || t === '.') return t;
  const n = parseFloat(t);
  if (Number.isNaN(n)) return t;
  if (n > MAX_ROUTINE_WEIGHT_LBS) return String(MAX_ROUTINE_WEIGHT_LBS);
  return t;
}

// Create/Edit Routine Modal
const CreateEditRoutineModal = ({ visible, onClose, onSave, editingRoutine }: CreateEditRoutineModalProps) => {
  const [routineName, setRoutineName] = useState('');
  const [selectedDay, setSelectedDay] = useState<'Push' | 'Pull' | 'Legs' | 'Custom'>('Push');
  const [customDayName, setCustomDayName] = useState('');
  const [selectedExercises, setSelectedExercises] = useState<RoutineExercise[]>([]);
  const [cardioItems, setCardioItems] = useState<RoutineCardio[]>([]);
  const [showSearchModal, setShowSearchModal] = useState(false);

  const days: ('Push' | 'Pull' | 'Legs' | 'Custom')[] = ['Push', 'Pull', 'Legs', 'Custom'];

  // Load editing routine data when modal opens
  useEffect(() => {
    if (editingRoutine) {
      setRoutineName(editingRoutine.name);
      setSelectedDay(editingRoutine.day);
      setCustomDayName(editingRoutine.customDayName || '');
      setSelectedExercises(editingRoutine.exercises);
      setCardioItems(
        editingRoutine.cardio && editingRoutine.cardio.length > 0
          ? editingRoutine.cardio.map((c: RoutineCardio) => normalizeCardioRow(c))
          : []
      );
    } else {
      resetForm();
    }
  }, [editingRoutine]);

  const handleAddExercise = (exercise: any) => {
    const defaultSetCount = 3;
    const defaultSets = Array.from({ length: defaultSetCount }, (_, i) => ({
      setNumber: i + 1,
      reps: '',
      weight: '',
    }));

    const newExercise: RoutineExercise = {
      exerciseId: exercise.id,
      name: exercise.name,
      muscleGroup: exercise.primaryMuscles?.[0] || 'Other',
      defaultSetCount: defaultSetCount,
      sets: defaultSets,
    };
    setSelectedExercises([...selectedExercises, newExercise]);
  };

  const handleRemoveExercise = (index: number) => {
    setSelectedExercises(selectedExercises.filter((_, i) => i !== index));
  };

  const handleAddCardio = () => {
    setCardioItems([
      ...cardioItems,
      { id: `cardio-${Date.now()}`, type: "treadmill", duration: "", unit: "min", calories: "" },
    ]);
  };

  const handleRemoveCardio = (index: number) => {
    setCardioItems(cardioItems.filter((_, i) => i !== index));
  };

  const handleUpdateCardio = (
    index: number,
    field: 'type' | 'duration' | 'unit' | 'calories',
    value: string
  ) => {
    const next = [...cardioItems];
    if (field === "unit") {
      next[index] = { ...next[index], unit: value === 'hr' ? 'hr' : 'min' };
    } else if (field === "type") {
      next[index] = {
        ...next[index],
        type: CARDIO_TYPES.includes(value as RoutineCardio["type"])
          ? (value as RoutineCardio["type"])
          : "other",
      };
    } else {
      next[index] = { ...next[index], [field]: value };
    }
    setCardioItems(next);
  };

  const handleUpdateSet = (exerciseIndex: number, setNumber: number, field: 'reps' | 'weight', value: string) => {
    const nextValue = field === 'weight' ? clampRoutineWeightInput(value) : value;
    const updated = [...selectedExercises];
    const exercise = updated[exerciseIndex];
    if (exercise.sets) {
      const setIndex = exercise.sets.findIndex(s => s.setNumber === setNumber);
      if (setIndex !== -1) {
        exercise.sets[setIndex] = { ...exercise.sets[setIndex], [field]: nextValue };
      }
    }
    setSelectedExercises(updated);
  };

  const handleAddSet = (exerciseIndex: number) => {
    const updated = [...selectedExercises];
    const exercise = updated[exerciseIndex];
    const newSetNumber = (exercise.sets?.length || exercise.defaultSetCount) + 1;
    
    if (!exercise.sets) {
      exercise.sets = [];
    }
    
    exercise.sets.push({
      setNumber: newSetNumber,
      reps: '',
      weight: '',
    });
    exercise.defaultSetCount = newSetNumber;
    
    setSelectedExercises(updated);
  };

  const handleRemoveSet = (exerciseIndex: number) => {
    const updated = [...selectedExercises];
    const exercise = updated[exerciseIndex];
    
    if (exercise.sets && exercise.sets.length > 1) {
      exercise.sets = exercise.sets.slice(0, -1);
      exercise.defaultSetCount = exercise.sets.length;
    }
    
    setSelectedExercises(updated);
  };

  const resetForm = () => {
    setRoutineName('');
    setSelectedDay('Push');
    setCustomDayName('');
    setSelectedExercises([]);
    setCardioItems([]);
  };

  const handleSave = () => {
    if (!routineName.trim()) {
      Alert.alert('Error', 'Please enter a routine name');
      return;
    }
    if (selectedExercises.length === 0) {
      Alert.alert('Error', 'Please add at least one exercise');
      return;
    }
    if (selectedDay === 'Custom' && !customDayName.trim()) {
      Alert.alert('Error', 'Please enter a custom day name');
      return;
    }

    const exercisesWithSets = selectedExercises.map(ex => ({
      ...ex,
      sets: ex.sets || Array.from({ length: ex.defaultSetCount }, (_, i) => ({
        setNumber: i + 1,
        reps: '',
        weight: '',
      })),
    }));

    const cleanedCardio = cardioItems.filter(
      (c) => c.duration.trim() !== '' || c.calories.trim() !== ''
    );

    const routineData: Routine = {
      id: editingRoutine ? editingRoutine.id : Date.now().toString(),
      name: routineName.trim(),
      day: selectedDay,
      customDayName: selectedDay === 'Custom' ? customDayName.trim() : undefined,
      exercises: exercisesWithSets,
      cardio: cleanedCardio.length > 0 ? cleanedCardio : undefined,
      createdAt: editingRoutine ? editingRoutine.createdAt : new Date(),
    };

    onSave(routineData);
    resetForm();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editingRoutine ? 'Edit Routine' : 'Create Routine'}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalScroll}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Routine Name</Text>
              <TextInput
                style={styles.input}
                value={routineName}
                onChangeText={setRoutineName}
                placeholder="e.g., Upper Body Strength"
                placeholderTextColor="#666"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Day</Text>
              <View style={styles.dayButtons}>
                {days.map((day) => (
                  <TouchableOpacity
                    key={day}
                    style={[
                      styles.dayButton,
                      selectedDay === day && styles.dayButtonSelected,
                    ]}
                    onPress={() => setSelectedDay(day)}>
                    <Text
                      style={[
                        styles.dayButtonText,
                        selectedDay === day && styles.dayButtonTextSelected,
                      ]}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {selectedDay === 'Custom' && (
              <View style={styles.inputGroup}>
                <TextInput
                  style={styles.input}
                  value={customDayName}
                  onChangeText={setCustomDayName}
                  placeholder="Enter custom day name"
                  placeholderTextColor="#666"
                />
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Add Exercises</Text>
              <TouchableOpacity
                style={styles.searchButton}
                onPress={() => setShowSearchModal(true)}>
                <Text style={styles.searchButtonPlaceholder}>Search exercises...</Text>
                <Text style={styles.addIcon}>+</Text>
              </TouchableOpacity>
            </View>

            {selectedExercises.length > 0 && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Selected Exercises</Text>
                {selectedExercises.map((exercise, exerciseIndex) => (
                  <View key={exerciseIndex} style={styles.exerciseCard}>
                    <View style={styles.exerciseHeader}>
                      <View style={styles.exerciseHeaderLeft}>
                        <Text style={styles.exerciseName}>{exercise.name}</Text>
                        <Text style={styles.exerciseMeta}>{exercise.muscleGroup}</Text>
                      </View>
                      <View style={styles.exerciseHeaderRight}>
                        <View style={styles.setControls}>
                          <TouchableOpacity
                            style={styles.setControlButton}
                            onPress={() => handleRemoveSet(exerciseIndex)}>
                            <Text style={styles.setControlText}>−</Text>
                          </TouchableOpacity>
                          <Text style={styles.setCount}>
                            {exercise.sets?.length || exercise.defaultSetCount} sets
                          </Text>
                          <TouchableOpacity
                            style={styles.setControlButton}
                            onPress={() => handleAddSet(exerciseIndex)}>
                            <Text style={styles.setControlText}>+</Text>
                          </TouchableOpacity>
                        </View>
                        <TouchableOpacity onPress={() => handleRemoveExercise(exerciseIndex)}>
                          <Text style={styles.removeIcon}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Set Editor Table */}
                    <View style={styles.setsTable}>
                      <View style={styles.setTableHeader}>
                        <Text style={styles.setTableHeaderCell}>Set</Text>
                        <Text style={styles.setTableHeaderCell}>Reps</Text>
                        <Text style={styles.setTableHeaderCell}>Weight (lbs)</Text>
                      </View>
                      
                      {(exercise.sets || Array.from({ length: exercise.defaultSetCount }, (_, i) => ({
                        setNumber: i + 1,
                        reps: '',
                        weight: '',
                      }))).map((set) => (
                        <View key={set.setNumber} style={styles.setRow}>
                          <Text style={styles.setNumberCell}>{set.setNumber}</Text>
                          <TextInput
                            style={styles.setInput}
                            value={set.reps}
                            onChangeText={(value) => 
                              handleUpdateSet(exerciseIndex, set.setNumber, 'reps', value)
                            }
                            placeholder="0"
                            placeholderTextColor="#444"
                            keyboardType="numeric"
                          />
                          <TextInput
                            style={styles.setInput}
                            value={set.weight}
                            onChangeText={(value) => 
                              handleUpdateSet(exerciseIndex, set.setNumber, 'weight', value)
                            }
                            placeholder="0"
                            placeholderTextColor="#444"
                            keyboardType="numeric"
                          />
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Cardio (optional)</Text>
              <Text style={styles.cardioHint}>
                Select cardio type, plus duration and calories.
              </Text>
              {cardioItems.map((row, idx) => (
                <View key={row.id} style={styles.cardioEditorRow}>
                  <View style={styles.cardioTypeGrid}>
                    {CARDIO_TYPES.map((type) => (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.cardioTypeChip,
                          row.type === type && styles.cardioTypeChipActive,
                        ]}
                        onPress={() => handleUpdateCardio(idx, "type", type)}>
                        <Text
                          style={[
                            styles.cardioTypeChipText,
                            row.type === type && styles.cardioTypeChipTextActive,
                          ]}>
                          {type}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.cardioDurationRow}>
                    <TextInput
                      style={styles.cardioDurationInput}
                      value={row.duration}
                      onChangeText={(t) => handleUpdateCardio(idx, 'duration', t)}
                      placeholder="Duration"
                      placeholderTextColor="#444"
                      keyboardType="numeric"
                    />
                    <TextInput
                      style={styles.cardioDurationInput}
                      value={row.calories}
                      onChangeText={(t) => handleUpdateCardio(idx, 'calories', t)}
                      placeholder="Calories"
                      placeholderTextColor="#444"
                      keyboardType="numeric"
                    />
                    <View style={styles.cardioUnitToggle}>
                      <TouchableOpacity
                        style={[
                          styles.cardioUnitChip,
                          row.unit === 'min' && styles.cardioUnitChipActive,
                        ]}
                        onPress={() => handleUpdateCardio(idx, 'unit', 'min')}>
                        <Text
                          style={[
                            styles.cardioUnitChipText,
                            row.unit === 'min' && styles.cardioUnitChipTextActive,
                          ]}>
                          min
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.cardioUnitChip,
                          row.unit === 'hr' && styles.cardioUnitChipActive,
                        ]}
                        onPress={() => handleUpdateCardio(idx, 'unit', 'hr')}>
                        <Text
                          style={[
                            styles.cardioUnitChipText,
                            row.unit === 'hr' && styles.cardioUnitChipTextActive,
                          ]}>
                          hr
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      style={styles.cardioRemoveBtn}
                      onPress={() => handleRemoveCardio(idx)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={styles.cardioRemoveBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <TouchableOpacity style={styles.addCardioButton} onPress={handleAddCardio}>
                <Text style={styles.addCardioButtonText}>+ Add cardio</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>
              {editingRoutine ? 'Update Routine' : 'Create Routine'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      <ExerciseSearchModal
        visible={showSearchModal}
        title="Add Exercise"
        onClose={() => setShowSearchModal(false)}
        onSelect={(exercise) => {
          handleAddExercise(exercise);
          setShowSearchModal(false);
        }}
      />
    </Modal>
  );
};

export default function RoutinesScreen() {
  const router = useRouter();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);

  const getRoutineDescription = (routine: Routine) => {
    const dayLabel = routine.day === 'Custom' ? routine.customDayName || 'Custom' : routine.day;
    return `${dayLabel} • ${routine.exercises.length} exercises`;
  };

  useEffect(() => {
    loadRoutines();
  }, []);

  const loadRoutines = async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) {
        setRoutines(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Failed to load routines');
    }
  };

  const saveRoutines = async (newRoutines: Routine[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newRoutines));
      setRoutines(newRoutines);
    } catch (error) {
      Alert.alert('Error', 'Failed to save routine');
    }
  };

  const handleCreateRoutine = async (newRoutine: Routine) => {
    let routineToPersist = newRoutine;

    try {
      const userId = await AsyncStorage.getItem('userId');
      if (userId) {
        const { data, error } = await supabase
          .from('routines')
          .insert({
            routine_name: newRoutine.name,
            description: getRoutineDescription(newRoutine),
            created_at: newRoutine.createdAt instanceof Date
              ? newRoutine.createdAt.toISOString()
              : new Date(newRoutine.createdAt).toISOString(),
            user_id: userId,
          })
          .select('routine_id')
          .single();

        if (error) throw error;

        if (data?.routine_id != null) {
          routineToPersist = {
            ...newRoutine,
            id: String(data.routine_id),
          };
        }
      }
    } catch (error) {
      console.error('Failed to save routine to DB:', error);
      Alert.alert('Sync Warning', 'Routine saved locally, but failed to sync to the database.');
    }

    const updated = [...routines, routineToPersist];
    await saveRoutines(updated);
    setShowCreateModal(false);
    setEditingRoutine(null);
  };

  const handleEditRoutine = (routine: Routine) => {
    setEditingRoutine(routine);
    setShowCreateModal(true);
  };

  const handleUpdateRoutine = async (updatedRoutine: Routine) => {
    try {
      const routineId = Number.parseInt(updatedRoutine.id, 10);
      if (Number.isFinite(routineId)) {
        const { error } = await supabase
          .from('routines')
          .update({
            routine_name: updatedRoutine.name,
            description: getRoutineDescription(updatedRoutine),
          })
          .eq('routine_id', routineId);

        if (error) throw error;
      }
    } catch (error) {
      console.error('Failed to update routine in DB:', error);
      Alert.alert('Sync Warning', 'Routine updated locally, but failed to sync update to the database.');
    }

    const updated = routines.map(r => 
      r.id === updatedRoutine.id ? updatedRoutine : r
    );
    await saveRoutines(updated);
    setShowCreateModal(false);
    setEditingRoutine(null);
  };

  const handleDeleteRoutine = (routineId: string) => {
    const performDelete = async () => {
      try {
        const parsedRoutineId = Number.parseInt(routineId, 10);
        if (Number.isFinite(parsedRoutineId)) {
          const { error } = await supabase
            .from('routines')
            .delete()
            .eq('routine_id', parsedRoutineId);

          if (error) throw error;
        }
      } catch (error) {
        console.error('Failed to delete routine in DB:', error);
        Alert.alert('Sync Warning', 'Routine deleted locally, but failed to sync delete to the database.');
      }

      const updated = routines.filter((r) => r.id !== routineId);
      await saveRoutines(updated);
    };

    // react-native-web's Alert.alert with multiple buttons is unreliable: the dialog
    // may not show or button onPress callbacks may never run. Native Alert works fine.
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Delete this routine?')) {
        performDelete();
      }
      return;
    }

    Alert.alert('Delete Routine', 'Are you sure you want to delete this routine?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: performDelete },
    ]);
  };

  const handleUseRoutine = (routine: Routine) => {
    router.push({
      pathname: '/',
      params: { 
        selectedRoutine: JSON.stringify(routine) 
      }
    });
  };

  const routinesByDay = {
    Push: routines.filter(r => r.day === 'Push'),
    Pull: routines.filter(r => r.day === 'Pull'),
    Legs: routines.filter(r => r.day === 'Legs'),
    Custom: routines.filter(r => r.day === 'Custom'),
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#0066CC', '#4A9EFF']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Routines</Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => {
              setEditingRoutine(null);
              setShowCreateModal(true);
            }}>
            <Text style={styles.createButtonText}>+ Create</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView style={styles.content}>
        {routinesByDay.Push.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Push Day</Text>
            {routinesByDay.Push.map((routine) => (
              <RoutineCard
                key={routine.id}
                routine={routine}
                onDelete={handleDeleteRoutine}
                onUse={handleUseRoutine}
                onEdit={handleEditRoutine}
              />
            ))}
          </View>
        )}

        {routinesByDay.Pull.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pull Day</Text>
            {routinesByDay.Pull.map((routine) => (
              <RoutineCard
                key={routine.id}
                routine={routine}
                onDelete={handleDeleteRoutine}
                onUse={handleUseRoutine}
                onEdit={handleEditRoutine}
              />
            ))}
          </View>
        )}

        {routinesByDay.Legs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Legs Day</Text>
            {routinesByDay.Legs.map((routine) => (
              <RoutineCard
                key={routine.id}
                routine={routine}
                onDelete={handleDeleteRoutine}
                onUse={handleUseRoutine}
                onEdit={handleEditRoutine}
              />
            ))}
          </View>
        )}

        {routinesByDay.Custom.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Custom Days</Text>
            {routinesByDay.Custom.map((routine) => (
              <RoutineCard
                key={routine.id}
                routine={routine}
                onDelete={handleDeleteRoutine}
                onUse={handleUseRoutine}
                onEdit={handleEditRoutine}
              />
            ))}
          </View>
        )}

        {routines.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No routines yet</Text>
            <Text style={styles.emptyStateSubtext}>
              Tap Create to build your first routine
            </Text>
          </View>
        )}
      </ScrollView>

      <CreateEditRoutineModal
        visible={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setEditingRoutine(null);
        }}
        onSave={editingRoutine ? handleUpdateRoutine : handleCreateRoutine}
        editingRoutine={editingRoutine}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  createButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
    paddingLeft: 4,
  },
  routineCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  routineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  routineHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  chevron: {
    color: '#0066CC',
    fontSize: 16,
    marginRight: 12,
  },
  routineName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  routineDay: {
    fontSize: 12,
    color: '#888',
  },
  routineHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  exerciseCount: {
    fontSize: 12,
    color: '#888',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editButton: {
    backgroundColor: '#4A9EFF',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  useButton: {
    backgroundColor: '#0066CC',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  useButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  routineExercises: {
    borderTopWidth: 1,
    borderTopColor: '#333',
    padding: 16,
  },
  routineExerciseItem: {
    marginBottom: 12,
  },
  routineExerciseInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  routineExerciseName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  routineExerciseMeta: {
    fontSize: 12,
    color: '#888',
  },
  routineExerciseNotes: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  routineCardioBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  routineCardioTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0066CC',
    marginBottom: 8,
  },
  routineCardioRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  routineCardioName: {
    fontSize: 14,
    color: '#FFFFFF',
    flex: 1,
  },
  routineCardioMeta: {
    fontSize: 13,
    color: '#888',
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
  modalScroll: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#000000',
    borderRadius: 8,
    padding: 12,
    color: '#FFFFFF',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  dayButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  dayButton: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  dayButtonSelected: {
    backgroundColor: '#0066CC',
    borderColor: '#0066CC',
  },
  dayButtonText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
  },
  dayButtonTextSelected: {
    color: '#FFFFFF',
  },
  searchButton: {
    backgroundColor: '#000000',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  searchButtonPlaceholder: {
    color: '#666',
    fontSize: 16,
  },
  addIcon: {
    color: '#0066CC',
    fontSize: 20,
  },
  savedSetsContainer: {
    marginTop: 8,
    backgroundColor: '#000000',
    borderRadius: 8,
    padding: 8,
  },
  savedSetsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    marginBottom: 4,
  },
  savedSetsHeaderText: {
    color: '#888',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  savedSetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  savedSetText: {
    color: '#0066CC',
    fontSize: 12,
    flex: 1,
    textAlign: 'center',
  },
  exerciseCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  exerciseHeaderLeft: {
    flex: 1,
  },
  exerciseHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  exerciseMeta: {
    fontSize: 12,
    color: '#888',
  },
  setControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  setControlButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#0066CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  setControlText: {
    color: '#0066CC',
    fontSize: 16,
    fontWeight: '600',
  },
  setCount: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    minWidth: 50,
    textAlign: 'center',
  },
  setsTable: {
    marginTop: 8,
  },
  setTableHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  setTableHeaderCell: {
    flex: 1,
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  setNumberCell: {
    flex: 1,
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
  },
  setInput: {
    flex: 1,
    backgroundColor: '#000000',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginHorizontal: 4,
    color: '#FFFFFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#333',
    textAlign: 'center',
  },
  removeIcon: {
    color: '#0066CC',
    fontSize: 20,
  },
  cardioHint: {
    fontSize: 12,
    color: '#888',
    marginBottom: 12,
    lineHeight: 18,
  },
  cardioEditorRow: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  cardioTypeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  cardioTypeChip: {
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#000",
  },
  cardioTypeChipActive: {
    borderColor: "#0066CC",
    backgroundColor: "#0066CC",
  },
  cardioTypeChipText: {
    color: "#888",
    fontSize: 12,
    fontWeight: "600",
  },
  cardioTypeChipTextActive: {
    color: "#FFFFFF",
  },
  cardioDurationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardioDurationInput: {
    flex: 1,
    backgroundColor: '#000',
    borderRadius: 6,
    padding: 10,
    color: '#FFFFFF',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#333',
  },
  cardioUnitToggle: {
    flexDirection: 'row',
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#333',
  },
  cardioUnitChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#000',
  },
  cardioUnitChipActive: {
    backgroundColor: '#0066CC',
  },
  cardioUnitChipText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
  cardioUnitChipTextActive: {
    color: '#FFFFFF',
  },
  cardioRemoveBtn: {
    padding: 8,
  },
  cardioRemoveBtnText: {
    color: '#888',
    fontSize: 16,
  },
  addCardioButton: {
    borderWidth: 1,
    borderColor: '#0066CC',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  addCardioButtonText: {
    color: '#0066CC',
    fontSize: 15,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#0066CC',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});