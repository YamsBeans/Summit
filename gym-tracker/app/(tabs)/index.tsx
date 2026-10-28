import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { db, isOnline } from "@/backend/db";
import { useTheme } from "@/theme/ThemeContext";
import { useGuardedPress } from "@/utils/pressGuard";
import ConfirmModal from "@/components/ConfirmModal";
import { useActiveWorkout } from "@/utils/ActiveWorkoutContext";
import { defaultWorkoutName } from "@/utils/workoutName";


// Move Up / Move Down persist routine_order, but the list was rendered in
// whatever order the server returned, so a reorder was lost on the next load.
function sortRoutines(list: any[]) {
  return [...list].sort((a, b) => {
    const ao = a.routine_order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.routine_order ?? Number.MAX_SAFE_INTEGER;
    return ao !== bo ? ao - bo : a.routine_id - b.routine_id;
  });
}

export default function WorkoutsScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const hasLoadedRef = useRef(false);
  const { colors } = useTheme();
  const { activeWorkout } = useActiveWorkout();
  const [showInProgress, setShowInProgress] = useState(false);
  const [startingEmpty, setStartingEmpty] = useState(false);

  const resumeActive = useCallback(() => {
    setShowInProgress(false);
    if (!activeWorkout) return;
    router.push({ pathname: "/workout", params: { sessionId: String(activeWorkout.sessionId) } });
  }, [activeWorkout, router]);

  const [routines, setRoutines] = useState<any[]>([]);
  const [loadingRoutines, setLoadingRoutines] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [routineName, setRoutineName] = useState("");
  const [description, setDescription] = useState("");
  const [startingId, setStartingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Routine options bottom sheet
  const [routineOptionsVisible, setRoutineOptionsVisible] = useState(false);
  const [selectedRoutine, setSelectedRoutine] = useState<any>(null);

  // Delete confirm
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);

  const loadRoutines = async (showSpinner = true) => {
    if (showSpinner) setLoadingRoutines(true);
    setError(null);
    const { data, error: err } = await db.getRoutines();
    if (err) setError(err.message);
    else setRoutines(sortRoutines(data ?? []));
    setLoadingRoutines(false);
  };

  const insertRoutine = useGuardedPress(async () => {
    if (!routineName.trim()) { setError("Routine name is required"); return; }
    setError(null);
    const { data: { user } } = await db.getUser();
    if (!user) { setError("Not authenticated"); return; }
    const { error: err } = await db.insertRoutine({
      routine_name: routineName.trim(),
      description: description.trim() || null,
      user_id: user.id,
    });
    if (err) { setError(err.message); return; }
    setRoutineName(""); setDescription(""); setShowForm(false);
    loadRoutines();
  });

  // Quick start: an empty workout you add exercises to as you go.
  const handleStartEmpty = useGuardedPress(async () => {
    if (activeWorkout) { setShowInProgress(true); return; }
    setError(null);
    setStartingEmpty(true);
    try {
      const { data: { user } } = await db.getUser();
      if (!user) { setError("Not authenticated"); return; }
      const { data: session, error: err } = await db.startWorkoutSession({
        routine_id: null,
        session_name: defaultWorkoutName(),
        user_id: user.id,
      });
      if (err || !session) { setError(err?.message ?? "Could not start workout"); return; }
      router.push({ pathname: "/workout", params: { sessionId: String(session.session_id) } });
    } finally {
      setStartingEmpty(false);
    }
  }, 1000);

  const handleStartWorkout = useGuardedPress(async (routineId: number) => {
    // Only one workout at a time — starting another would strand the first.
    if (activeWorkout) { setShowInProgress(true); return; }
    setStartingId(routineId);
    const { data: { user } } = await db.getUser();
    if (!user) { setError("Not authenticated"); setStartingId(null); return; }
    const { data: session, error: err } = await db.startWorkoutFromRoutine(routineId, user.id);
    if (err) { setError(err.message); setStartingId(null); return; }
    setStartingId(null);
    router.push({ pathname: "/workout", params: { sessionId: String(session.session_id) } });
  }, 1000);

  // ── Options menu ──

  const openRoutineOptions = useCallback((routine: any) => {
    setSelectedRoutine(routine);
    setRoutineOptionsVisible(true);
  }, []);

  const closeRoutineOptions = useCallback(() => {
    setRoutineOptionsVisible(false);
    setSelectedRoutine(null);
  }, []);

  // ── Edit ──

  const openEditInScreen = useCallback(() => {
    if (!selectedRoutine) return;
    closeRoutineOptions();
    router.push({
      pathname: "/routine/[routineId]",
      params: {
        routineId: String(selectedRoutine.routine_id),
        routineName: selectedRoutine.routine_name,
        description: selectedRoutine.description ?? "",
        mode: "edit",
      },
    });
  }, [selectedRoutine, closeRoutineOptions, router]);

  // ── Delete ──

  const handleDeleteRoutine = useGuardedPress(async () => {
    if (!selectedRoutine) return;
    const { error: err } = await db.deleteRoutine(selectedRoutine.routine_id);
    if (err) { setError(err.message); setDeleteConfirmVisible(false); return; }
    setRoutines((prev) => prev.filter((r) => r.routine_id !== selectedRoutine.routine_id));
    setDeleteConfirmVisible(false);
    setSelectedRoutine(null);
  });

  // ── Reorder (move up / move down) ──

  const moveRoutine = useCallback(async (routineId: number, direction: "up" | "down") => {
    setRoutines((prev) => {
      const idx = prev.findIndex((r) => r.routine_id === routineId);
      if (idx === -1) return prev;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      // Persist new order in background
      next.forEach((r, i) => {
        db.updateRoutine(r.routine_id, { routine_order: i + 1 });
      });
      return next;
    });
    closeRoutineOptions();
  }, [closeRoutineOptions]);

  useFocusEffect(useCallback(() => {
    loadRoutines(!hasLoadedRef.current);
    hasLoadedRef.current = true;
  }, []));

  const selectedIdx = routines.findIndex((r) => r.routine_id === selectedRoutine?.routine_id);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Page header ── */}
        <View style={[styles.pageHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.pageTitle, { color: colors.text }]}>Workout</Text>
          <View style={styles.headerRight}>
            {!isOnline && (
              <View style={[styles.offlineBadge, { backgroundColor: colors.warningLight }]}>
                <Text style={[styles.offlineText, { color: colors.warning }]}>Offline</Text>
              </View>
            )}
          </View>
        </View>

        {error && (
          <View style={[styles.errorBanner, { backgroundColor: colors.dangerLight }]}>
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
          </View>
        )}

        {/* ── Quick start ── */}
        <View style={styles.quickStart}>
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 10, marginLeft: 4 }]}>Quick Start</Text>
          <Pressable
            style={({ pressed }) => [
              styles.quickStartBtn,
              { backgroundColor: activeWorkout ? colors.success : colors.primary },
              (pressed || startingEmpty) && { opacity: 0.75 },
            ]}
            disabled={startingEmpty}
            onPress={activeWorkout ? resumeActive : handleStartEmpty}
            accessibilityRole="button"
            accessibilityLabel={activeWorkout ? `Resume ${activeWorkout.sessionName}` : "Start an empty workout"}
          >
            <Ionicons name={activeWorkout ? "play-forward" : "add"} size={18} color="#fff" />
            <Text style={styles.quickStartText} numberOfLines={1}>
              {activeWorkout
                ? `Resume ${activeWorkout.sessionName}`
                : startingEmpty ? "Starting…" : "Start Empty Workout"}
            </Text>
          </Pressable>
        </View>

        {/* ── Create routine form ── */}
        {showForm && (
          <View style={[styles.formCard, { backgroundColor: colors.surface }]}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
              placeholder="Routine name"
              placeholderTextColor={colors.textTertiary}
              value={routineName}
              onChangeText={setRoutineName}
              returnKeyType="next"
            />
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
              placeholder="Description (optional)"
              placeholderTextColor={colors.textTertiary}
              value={description}
              onChangeText={setDescription}
              returnKeyType="done"
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                style={[styles.formCancelBtn, { backgroundColor: colors.surfaceSecondary }]}
                onPress={() => setShowForm(false)}
              >
                <Text style={[styles.formCancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.formSaveBtn, { backgroundColor: colors.primary }]} onPress={insertRoutine}>
                <Text style={styles.formSaveText}>Save Routine</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Routines section label + action buttons ── */}
        <View style={[styles.sectionRow, { flexDirection: "row", alignItems: "center" }]}>
          <Text style={[styles.sectionTitle, { color: colors.text, flex: 1 }]}>Routines</Text>
          <View style={styles.routineActions}>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => { setShowForm((v) => !v); setRoutineName(""); setDescription(""); }}
            >
              <Ionicons name="document-text-outline" size={15} color={colors.text} />
              <Text style={[styles.actionBtnText, { color: colors.text }]}>New Routine</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => router.push("/explore")}
            >
              <Ionicons name="compass-outline" size={15} color={colors.text} />
              <Text style={[styles.actionBtnText, { color: colors.text }]}>Explore</Text>
            </Pressable>
          </View>
        </View>

        {/* ── My Routines label ── */}
        <View style={styles.myRoutinesRow}>
          <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
          <Text style={[styles.myRoutinesLabel, { color: colors.textSecondary }]}>
            My Routines ({routines.length})
          </Text>
        </View>

        {/* ── Routine list ── */}
        {loadingRoutines ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={colors.primary} />
        ) : routines.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="barbell-outline" size={40} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No routines yet</Text>
            <Text style={[styles.emptySubText, { color: colors.textTertiary }]}>
              Tap “New Routine” to start, or try Explore for premade programs
            </Text>
          </View>
        ) : (
          <View style={styles.routineList}>
            {routines.map((item) => (
              <Pressable
                key={String(item.routine_id)}
                style={[styles.routineCard, { backgroundColor: colors.surface }]}
                onPress={() =>
                  router.push({
                    pathname: "/routine/[routineId]",
                    params: {
                      routineId: String(item.routine_id),
                      routineName: item.routine_name,
                      description: item.description ?? "",
                    },
                  })
                }
              >
                <View style={styles.routineInfo}>
                  <View style={[styles.routineIconWrap, { backgroundColor: colors.primaryLight }]}>
                    <Ionicons name="barbell-outline" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.routineText}>
                    <Text style={[styles.routineName, { color: colors.text }]}>{item.routine_name}</Text>
                    {item.description ? (
                      <Text style={[styles.routineDesc, { color: colors.textSecondary }]} numberOfLines={1}>
                        {item.description}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={(e) => { e.stopPropagation(); openRoutineOptions(item); }}
                    hitSlop={8}
                    style={styles.ellipsisBtn}
                  >
                    <Ionicons name="ellipsis-horizontal" size={20} color={colors.textTertiary} />
                  </Pressable>
                </View>

                {/* Start Routine button */}
                <Pressable
                  style={[
                    styles.startBtn,
                    { backgroundColor: colors.primary },
                    startingId === item.routine_id && { opacity: 0.6 },
                  ]}
                  disabled={startingId !== null}
                  onPress={(e) => {
                    e.stopPropagation();
                    handleStartWorkout(item.routine_id);
                  }}
                >
                  <Ionicons name="play" size={14} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.startBtnText}>
                    {startingId === item.routine_id ? "Starting…" : "Start Routine"}
                  </Text>
                </Pressable>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── Routine options bottom sheet ── */}
      <Modal visible={routineOptionsVisible} transparent animationType="slide" onRequestClose={closeRoutineOptions}>
        <Pressable style={modalStyles.overlay} onPress={closeRoutineOptions}>
          <View style={[modalStyles.sheet, { backgroundColor: colors.surface }]}>
            <View style={[modalStyles.handle, { backgroundColor: colors.border }]} />
            <Text style={[modalStyles.sheetTitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {selectedRoutine?.routine_name}
            </Text>

            {/* Edit */}
            <Pressable style={[modalStyles.option, { borderBottomColor: colors.border }]} onPress={openEditInScreen}>
              <View style={[modalStyles.iconWrap, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="pencil-outline" size={16} color={colors.primary} />
              </View>
              <Text style={[modalStyles.optionLabel, { color: colors.text }]}>Edit Routine</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </Pressable>

            {/* Move Up */}
            <Pressable
              style={[
                modalStyles.option,
                { borderBottomColor: colors.border },
                selectedIdx === 0 && { opacity: 0.35 },
              ]}
              onPress={() => selectedIdx > 0 && moveRoutine(selectedRoutine.routine_id, "up")}
            >
              <View style={[modalStyles.iconWrap, { backgroundColor: colors.surfaceSecondary }]}>
                <Ionicons name="arrow-up-outline" size={16} color={colors.text} />
              </View>
              <Text style={[modalStyles.optionLabel, { color: colors.text }]}>Move Up</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </Pressable>

            {/* Move Down */}
            <Pressable
              style={[
                modalStyles.option,
                { borderBottomColor: colors.border },
                selectedIdx === routines.length - 1 && { opacity: 0.35 },
              ]}
              onPress={() => selectedIdx < routines.length - 1 && moveRoutine(selectedRoutine.routine_id, "down")}
            >
              <View style={[modalStyles.iconWrap, { backgroundColor: colors.surfaceSecondary }]}>
                <Ionicons name="arrow-down-outline" size={16} color={colors.text} />
              </View>
              <Text style={[modalStyles.optionLabel, { color: colors.text }]}>Move Down</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </Pressable>

            {/* Delete */}
            <Pressable
              style={modalStyles.option}
              onPress={() => { setRoutineOptionsVisible(false); setDeleteConfirmVisible(true); }}
            >
              <View style={[modalStyles.iconWrap, { backgroundColor: colors.dangerLight }]}>
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
              </View>
              <Text style={[modalStyles.optionLabel, { color: colors.danger }]}>Delete Routine</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.danger} style={{ opacity: 0.4 }} />
            </Pressable>

            <Pressable
              style={[modalStyles.cancelBtn, { backgroundColor: colors.surfaceSecondary }]}
              onPress={closeRoutineOptions}
            >
              <Text style={[modalStyles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* ── Workout already in progress ── */}
      <ConfirmModal
        visible={showInProgress}
        title="Workout in Progress"
        message={`"${activeWorkout?.sessionName ?? "Your workout"}" is still running. Finish or discard it before starting another.`}
        confirmText="Resume"
        cancelText="Cancel"
        confirmStyle="primary"
        icon="barbell-outline"
        onConfirm={resumeActive}
        onCancel={() => setShowInProgress(false)}
      />

      {/* ── Delete confirm ── */}
      <ConfirmModal
        visible={deleteConfirmVisible}
        title="Delete Routine"
        message={`"${selectedRoutine?.routine_name}" will be permanently deleted. This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmStyle="danger"
        icon="trash-outline"
        onConfirm={handleDeleteRoutine}
        onCancel={() => { setDeleteConfirmVisible(false); setSelectedRoutine(null); }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 60,
    paddingBottom: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pageTitle: { flex: 1, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  offlineBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  offlineText: { fontSize: 12, fontWeight: "700" },
  createBtn: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },

  errorBanner: { marginHorizontal: 16, marginTop: 12, padding: 12, borderRadius: 10 },
  errorText: { fontSize: 14, fontWeight: "500" },

  formCard: { marginHorizontal: 16, marginBottom: 8, borderRadius: 14, padding: 16, gap: 10 },
  input: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 10,
    padding: 12, fontSize: 15,
  },
  formCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  formCancelText: { fontSize: 15, fontWeight: "600" },
  formSaveBtn: { flex: 2, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  formSaveText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  quickStart: { paddingHorizontal: 16, paddingTop: 20 },
  quickStartBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  quickStartText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  sectionRow: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 },
  sectionTitle: { fontSize: 17, fontWeight: "700" },
  routineActions: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionBtnText: { fontSize: 13, fontWeight: "600" },
  myRoutinesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  myRoutinesLabel: { fontSize: 14, fontWeight: "600" },

  emptyState: { alignItems: "center", paddingVertical: 48, gap: 8 },
  emptyText: { fontSize: 17, fontWeight: "600" },
  emptySubText: { fontSize: 14, textAlign: "center" },

  routineList: { paddingHorizontal: 16, gap: 10 },
  routineCard: { borderRadius: 16, overflow: "hidden" },

  routineInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  routineIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  routineText: { flex: 1 },
  routineName: { fontSize: 16, fontWeight: "700" },
  routineDesc: { fontSize: 13, marginTop: 2 },
  ellipsisBtn: { padding: 4 },

  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  startBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
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
    paddingHorizontal: 16,
    paddingBottom: 36,
    paddingTop: 12,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: "center", marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 13, fontWeight: "600",
    textAlign: "center", marginBottom: 12,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  optionLabel: { flex: 1, fontSize: 16, fontWeight: "500" },
  cancelBtn: {
    marginTop: 12, borderRadius: 14,
    paddingVertical: 14, alignItems: "center",
  },
  cancelText: { fontSize: 16, fontWeight: "600" },

});
