import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { showAlert } from "@/utils/alert";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { db } from "@/backend/db";
import { useTheme } from "@/theme/ThemeContext";
import { useProgressPhotoUrl } from "@/utils/useProgressPhotoUrl";
import ExercisePicker from "@/components/ExercisePicker";
import ProgressPhotoModal from "@/components/ProgressPhotoModal";
import { useUnits } from "@/utils/units";
import { formatNumberInput, parseDecimalInput, parseIntInput } from "@/utils/numberInput";

type EditSet = {
  session_set_id: number;
  set_number: number;
  /** Stored weight (always lbs). */
  weight_lbs: number | null;
  /** In-progress text typed by the user, in their display unit; null = not being edited. */
  weight: string | null;
  reps: string;
  is_warmup: boolean;
};

type EditExercise = {
  session_exercise_id: number;
  session_id: number;
  exercise_id: string;
  exercise_name: string;
  exercise_order: number;
  sets: EditSet[];
};

export default function WorkoutEditScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { toDisplay, toStorage, label: unitLabel } = useUnits();

  const sid = parseInt(sessionId ?? "0", 10);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [sessionNotes, setSessionNotes] = useState("");
  const [exercises, setExercises] = useState<EditExercise[]>([]);

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const photoSrc = useProgressPhotoUrl(photoUrl);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);

  const [showPicker, setShowPicker] = useState(false);
  const [exerciseOptionsVisible, setExerciseOptionsVisible] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<EditExercise | null>(null);

  const pickerModeRef = useRef<"add" | "replace">("add");
  const replaceTargetRef = useRef<EditExercise | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: session, error: sErr }, { data: exData, error: exErr }] = await Promise.all([
      db.getWorkoutSession(sid),
      db.getSessionExercises(sid),
    ]);
    if (sErr || exErr) {
      setError((sErr ?? exErr)?.message ?? "Failed to load workout");
      setLoading(false);
      return;
    }
    setSessionName(session?.session_name ?? "");
    setSessionNotes(session?.notes ?? "");
    setPhotoUrl(session?.photo_url ?? null);

    const exList: any[] = exData ?? [];
    const exerciseIds = exList.map((e) => e.session_exercise_id);
    const { data: allSets } = await db.getBatchSessionExerciseSets(exerciseIds);

    const setsByExercise: Record<number, any[]> = {};
    for (const set of allSets ?? []) {
      (setsByExercise[set.session_exercise_id] ??= []).push(set);
    }

    const enriched: EditExercise[] = exList.map((ex) => ({
      session_exercise_id: ex.session_exercise_id,
      session_id: ex.session_id,
      exercise_id: ex.exercise_id,
      exercise_name: ex.exercise_name,
      exercise_order: ex.exercise_order,
      sets: (setsByExercise[ex.session_exercise_id] ?? [])
        .sort((a: any, b: any) => a.set_number - b.set_number)
        .map((s: any): EditSet => ({
          session_set_id: s.session_set_id,
          set_number: s.set_number,
          weight_lbs: s.weight ?? null,
          weight: null,
          reps: s.reps != null ? String(s.reps) : "",
          is_warmup: s.is_warmup,
        })),
    }));

    setExercises(enriched);
    setLoading(false);
  }

  async function handleDone() {
    const trimmedName = sessionName.trim();
    if (!trimmedName) {
      setError("Workout name cannot be empty.");
      return;
    }
    setSaving(true);
    const { error: err } = await db.updateWorkoutSession(sid, {
      session_name: trimmedName,
      notes: sessionNotes.trim() || null,
    });
    setSaving(false);
    if (err) {
      setError((err as any).message ?? "Failed to save");
      return;
    }
    router.back();
  }

  // ── Photo editing ────────────────────────────────────

  async function handlePhoto(uri: string) {
    setPhotoUploading(true);
    const { data: userData } = await db.getUser();
    const userId = userData?.user?.id;
    if (userId) {
      const { url, error: uploadError } = await db.uploadProgressPhoto(userId, sid, uri);
      if (uploadError) {
        showAlert("Upload Failed", uploadError);
        setPhotoUploading(false);
        setShowPhotoModal(false);
        return;
      }
      await db.updateSessionPhotoUrl(sid, url);
      setPhotoUrl(url);
    } else {
      // offline — store local URI
      await db.updateSessionPhotoUrl(sid, uri);
      setPhotoUrl(uri);
    }
    setPhotoUploading(false);
    setShowPhotoModal(false);
  }

  async function handleRemovePhoto() {
    showAlert("Remove Photo", "Remove the progress photo from this workout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await db.updateSessionPhotoUrl(sid, null);
          setPhotoUrl(null);
        },
      },
    ]);
  }

  // ── Set editing ──────────────────────────────────────

  function updateSetLocal(sessionSetId: number, field: "weight" | "reps", value: string) {
    setExercises((prev) =>
      prev.map((ex) => ({
        ...ex,
        sets: ex.sets.map((s) =>
          s.session_set_id === sessionSetId ? { ...s, [field]: value } : s
        ),
      }))
    );
  }

  function patchSet(sessionSetId: number, patch: Partial<EditSet>) {
    setExercises((prev) =>
      prev.map((ex) => ({
        ...ex,
        sets: ex.sets.map((s) => (s.session_set_id === sessionSetId ? { ...s, ...patch } : s)),
      }))
    );
  }

  async function handleWeightBlur(set: EditSet) {
    if (set.weight == null) return; // untouched
    const val = parseDecimalInput(set.weight);
    // Weights are stored in lbs; only write when the shown value really changed
    // so viewing a workout in kg never rewrites it with a rounded number.
    if (val === toDisplay(set.weight_lbs)) {
      patchSet(set.session_set_id, { weight: null });
      return;
    }
    const lbs = toStorage(val);
    patchSet(set.session_set_id, { weight_lbs: lbs, weight: null });
    const { error: err } = await db.updateSessionExerciseSet(set.session_set_id, { weight: lbs });
    if (err) setError((err as any)?.message ?? "Failed to save set");
  }

  async function handleRepsBlur(set: EditSet) {
    const reps = parseIntInput(set.reps);
    patchSet(set.session_set_id, { reps: formatNumberInput(reps) });
    const { error: err } = await db.updateSessionExerciseSet(set.session_set_id, { reps });
    if (err) setError((err as any)?.message ?? "Failed to save set");
  }

  async function handleAddSet(exercise: EditExercise) {
    const lastSetNum = exercise.sets.at(-1)?.set_number ?? 0;
    const nextSetNum = lastSetNum + 1;
    const { data: newSet, error: err } = await db.insertSessionExerciseSet({
      session_exercise_id: exercise.session_exercise_id,
      set_number: nextSetNum,
      weight: null,
      reps: null,
      is_warmup: false,
      completed: true,
    });
    if (err || !newSet) {
      setError((err as any)?.message ?? "Failed to add set");
      return;
    }
    const editSet: EditSet = {
      session_set_id: newSet.session_set_id,
      set_number: nextSetNum,
      weight_lbs: null,
      weight: null,
      reps: "",
      is_warmup: false,
    };
    setExercises((prev) =>
      prev.map((ex) =>
        ex.session_exercise_id === exercise.session_exercise_id
          ? { ...ex, sets: [...ex.sets, editSet] }
          : ex
      )
    );
  }

  async function handleRemoveSet(exercise: EditExercise, set: EditSet) {
    const { error: err } = await db.deleteSessionExerciseSet(set.session_set_id);
    if (err) {
      setError((err as any).message ?? "Failed to remove set");
      return;
    }
    setExercises((prev) =>
      prev.map((ex) =>
        ex.session_exercise_id === exercise.session_exercise_id
          ? { ...ex, sets: ex.sets.filter((s) => s.session_set_id !== set.session_set_id) }
          : ex
      )
    );
  }

  // ── Exercise editing ──────────────────────────────────

  function closeExerciseOptions() {
    setExerciseOptionsVisible(false);
  }

  async function handleRemoveExercise(exercise: EditExercise) {
    closeExerciseOptions();
    const { error: err } = await db.deleteSessionExercise(exercise.session_exercise_id);
    if (err) {
      setError((err as any).message ?? "Failed to remove exercise");
      return;
    }
    setExercises((prev) =>
      prev.filter((ex) => ex.session_exercise_id !== exercise.session_exercise_id)
    );
  }

  async function handleAddExercise(exercise: { id: string; name: string }) {
    setShowPicker(false);
    const nextOrder = exercises.length + 1;
    const { data: newEx, error: err } = await db.insertSessionExercise({
      session_id: sid,
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      exercise_order: nextOrder,
      notes: null,
    });
    if (err || !newEx) {
      setError((err as any)?.message ?? "Failed to add exercise");
      return;
    }
    setExercises((prev) => [
      ...prev,
      {
        session_exercise_id: newEx.session_exercise_id,
        session_id: sid,
        exercise_id: exercise.id,
        exercise_name: exercise.name,
        exercise_order: nextOrder,
        sets: [],
      },
    ]);
  }

  async function handleReplaceExercise(exercise: { id: string; name: string }) {
    const target = replaceTargetRef.current;
    if (!target) return;
    setShowPicker(false);
    const { error: err } = await db.updateSessionExercise(target.session_exercise_id, {
      exercise_id: exercise.id,
      exercise_name: exercise.name,
    });
    if (err) {
      setError((err as any).message ?? "Failed to replace exercise");
      replaceTargetRef.current = null;
      return;
    }
    setExercises((prev) =>
      prev.map((ex) =>
        ex.session_exercise_id === target.session_exercise_id
          ? { ...ex, exercise_id: exercise.id, exercise_name: exercise.name }
          : ex
      )
    );
    replaceTargetRef.current = null;
  }

  // ── Render ────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={({ pressed }) => [pressed && { opacity: 0.5 }]}
        >
          <Ionicons name="chevron-back" size={26} color={colors.primary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Edit Workout</Text>
        <Pressable
          onPress={handleDone}
          hitSlop={8}
          disabled={saving}
          style={({ pressed }) => [pressed && { opacity: 0.5 }]}
        >
          <Text style={[styles.doneBtn, { color: saving ? colors.textTertiary : colors.primary }]}>
            {saving ? "Saving…" : "Done"}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Name + notes */}
        <View style={[styles.metaSection, { borderBottomColor: colors.border }]}>
          <TextInput
            style={[styles.nameInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBackground }]}
            value={sessionName}
            onChangeText={setSessionName}
            placeholder="Workout name"
            placeholderTextColor={colors.textTertiary}
            maxLength={80}
          />
          <TextInput
            style={[styles.notesInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBackground }]}
            value={sessionNotes}
            onChangeText={setSessionNotes}
            placeholder="Notes (optional)"
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={500}
          />
          {/* Progress photo */}
          {photoUrl ? (
            <View>
              <Image source={{ uri: photoSrc ?? undefined }} style={styles.photoPreview} resizeMode="contain" />
              <View style={styles.photoActions}>
                <Pressable
                  style={[styles.photoBtn, { backgroundColor: colors.surfaceSecondary }]}
                  onPress={() => setShowPhotoModal(true)}
                >
                  <Ionicons name="camera-outline" size={15} color={colors.textSecondary} />
                  <Text style={[styles.photoBtnText, { color: colors.textSecondary }]}>Change</Text>
                </Pressable>
                <Pressable
                  style={[styles.photoBtn, { backgroundColor: colors.dangerLight }]}
                  onPress={handleRemovePhoto}
                >
                  <Ionicons name="trash-outline" size={15} color={colors.danger} />
                  <Text style={[styles.photoBtnText, { color: colors.danger }]}>Remove</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              style={[styles.addPhotoBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={() => setShowPhotoModal(true)}
            >
              <Ionicons name="camera-outline" size={18} color={colors.primary} />
              <Text style={[styles.addPhotoBtnText, { color: colors.primary }]}>Add Progress Photo</Text>
            </Pressable>
          )}

          {error ? (
            <Text style={{ color: colors.danger, fontSize: 13, marginTop: 4 }}>{error}</Text>
          ) : null}
        </View>

        {/* Exercise list */}
        {exercises.map((ex) => (
          <View key={ex.session_exercise_id} style={[styles.exerciseBlock, { borderBottomColor: colors.border }]}>
            {/* Exercise header */}
            <View style={styles.exerciseHeader}>
              <Text style={[styles.exerciseName, { color: colors.primary }]} numberOfLines={1}>
                {ex.exercise_name}
              </Text>
              <Pressable
                hitSlop={12}
                onPress={() => {
                  setSelectedExercise(ex);
                  setExerciseOptionsVisible(true);
                }}
                style={({ pressed }) => [pressed && { opacity: 0.5 }]}
              >
                <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            {/* Column headers */}
            {ex.sets.length > 0 && (
              <View style={styles.setHeaderRow}>
                <Text style={[styles.setColLabel, { color: colors.textTertiary, width: 36 }]}>SET</Text>
                <Text style={[styles.setColLabel, { color: colors.textTertiary, flex: 1 }]}>{unitLabel.toUpperCase()}</Text>
                <Text style={[styles.setColLabel, { color: colors.textTertiary, flex: 1 }]}>REPS</Text>
                <View style={{ width: 28 }} />
              </View>
            )}

            {/* Sets */}
            {ex.sets.map((set, idx) => (
              <View key={set.session_set_id} style={styles.setRow}>
                <View style={[styles.setNumBadge, { backgroundColor: set.is_warmup ? colors.warningLight : colors.surfaceSecondary }]}>
                  <Text style={[styles.setNumText, { color: set.is_warmup ? colors.warning : colors.textSecondary }]}>
                    {set.is_warmup ? "W" : idx + 1}
                  </Text>
                </View>
                <TextInput
                  style={[styles.setInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBackground, flex: 1 }]}
                  value={set.weight ?? formatNumberInput(toDisplay(set.weight_lbs))}
                  onChangeText={(v) => updateSetLocal(set.session_set_id, "weight", v)}
                  onBlur={() => handleWeightBlur(set)}
                  placeholder="—"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                />
                <TextInput
                  style={[styles.setInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBackground, flex: 1 }]}
                  value={set.reps}
                  onChangeText={(v) => updateSetLocal(set.session_set_id, "reps", v)}
                  onBlur={() => handleRepsBlur(set)}
                  placeholder="—"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
                <Pressable
                  hitSlop={8}
                  onPress={() => handleRemoveSet(ex, set)}
                  style={({ pressed }) => [{ width: 28, alignItems: "center" }, pressed && { opacity: 0.5 }]}
                >
                  <Ionicons name="remove-circle-outline" size={20} color={colors.danger} />
                </Pressable>
              </View>
            ))}

            {/* Add set */}
            <Pressable
              style={({ pressed }) => [styles.addSetRow, pressed && { opacity: 0.5 }]}
              onPress={() => handleAddSet(ex)}
            >
              <Ionicons name="add" size={15} color={colors.primary} />
              <Text style={[styles.addSetText, { color: colors.primary }]}>Add Set</Text>
            </Pressable>
          </View>
        ))}

        {/* Add exercise */}
        <Pressable
          style={({ pressed }) => [
            styles.addExerciseBtn,
            { borderColor: colors.border, backgroundColor: colors.surface },
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => {
            pickerModeRef.current = "add";
            setShowPicker(true);
          }}
        >
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
          <Text style={[styles.addExerciseText, { color: colors.primary }]}>Add Exercise</Text>
        </Pressable>
      </ScrollView>

      {/* Exercise options bottom sheet */}
      <Modal
        visible={exerciseOptionsVisible}
        transparent
        animationType="slide"
        onRequestClose={closeExerciseOptions}
      >
        <Pressable style={modalStyles.overlay} onPress={closeExerciseOptions}>
          <Pressable style={[modalStyles.sheet, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <View style={[modalStyles.handle, { backgroundColor: colors.border }]} />
            <Text style={[modalStyles.title, { color: colors.textSecondary }]} numberOfLines={1}>
              {selectedExercise?.exercise_name}
            </Text>

            <Pressable
              style={[modalStyles.option, { borderBottomColor: colors.border }]}
              onPress={() => {
                pickerModeRef.current = "replace";
                replaceTargetRef.current = selectedExercise;
                closeExerciseOptions();
                setShowPicker(true);
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
                if (selectedExercise) handleRemoveExercise(selectedExercise);
              }}
            >
              <View style={[modalStyles.iconWrap, { backgroundColor: colors.dangerLight }]}>
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
              </View>
              <Text style={[modalStyles.optionLabel, { color: colors.danger }]}>Remove Exercise</Text>
            </Pressable>

            <Pressable
              style={[modalStyles.cancel, { backgroundColor: colors.surfaceSecondary }]}
              onPress={closeExerciseOptions}
            >
              <Text style={[modalStyles.cancelText, { color: colors.text }]}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Progress Photo Modal */}
      <ProgressPhotoModal
        visible={showPhotoModal}
        isUploading={photoUploading}
        onPhoto={handlePhoto}
        onSkip={() => setShowPhotoModal(false)}
      />

      {/* Exercise Picker */}
      <ExercisePicker
        visible={showPicker}
        onSelect={(exercise) => {
          if (pickerModeRef.current === "replace") {
            pickerModeRef.current = "add";
            handleReplaceExercise(exercise);
          } else {
            handleAddExercise(exercise);
          }
        }}
        onClose={() => {
          pickerModeRef.current = "add";
          replaceTargetRef.current = null;
          setShowPicker(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "700", textAlign: "center" },
  doneBtn: { fontSize: 16, fontWeight: "700", minWidth: 50, textAlign: "right" },

  metaSection: {
    padding: 16,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  nameInput: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 16, fontWeight: "600",
  },
  notesInput: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, minHeight: 72, textAlignVertical: "top",
  },

  exerciseBlock: {
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  exerciseHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  exerciseName: { flex: 1, fontSize: 15, fontWeight: "700", marginRight: 8 },

  setHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6, paddingHorizontal: 2 },
  setColLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.4 },

  setRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  setNumBadge: {
    width: 28, height: 28, borderRadius: 6,
    alignItems: "center", justifyContent: "center",
  },
  setNumText: { fontSize: 12, fontWeight: "700" },
  setInput: {
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 8,
    fontSize: 15, textAlign: "center",
  },

  addSetRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 8, paddingHorizontal: 2,
  },
  addSetText: { fontSize: 14, fontWeight: "600" },

  addExerciseBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, marginHorizontal: 16, marginTop: 20,
    paddingVertical: 14, borderRadius: 12, borderWidth: 1,
  },
  addExerciseText: { fontSize: 15, fontWeight: "700" },

  photoPreview: {
    width: "100%", aspectRatio: 3 / 4,
    borderRadius: 10, overflow: "hidden",
    backgroundColor: "#000",
  },
  photoActions: {
    flexDirection: "row", gap: 8, marginTop: 8,
  },
  photoBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 9, borderRadius: 8,
  },
  photoBtnText: { fontSize: 14, fontWeight: "600" },
  addPhotoBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 12, borderRadius: 10, borderWidth: 1,
  },
  addPhotoBtnText: { fontSize: 14, fontWeight: "600" },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34, paddingTop: 12 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  title: { fontSize: 13, fontWeight: "600", paddingHorizontal: 20, paddingBottom: 10 },
  option: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingVertical: 14, paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  optionLabel: { flex: 1, fontSize: 16, fontWeight: "500" },
  cancel: {
    marginHorizontal: 16, marginTop: 10, paddingVertical: 14,
    borderRadius: 12, alignItems: "center",
  },
  cancelText: { fontSize: 16, fontWeight: "600" },
});
