import { memo, useState } from "react";
import { ActivityIndicator, Image, Modal, Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { ModalShell } from "@/components/SettingsUI";
import { showAlert } from "@/utils/alert";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { db } from "@/backend/db";
import { logError } from "@/utils/log";
import { useTheme } from "@/theme/ThemeContext";
import { useUnits, formatVolume } from "@/utils/units";
import { formatDistance, formatDurationShort } from "@/utils/cardioUtils";
import { useProgressPhotoUrl } from "@/utils/useProgressPhotoUrl";
import { useActiveWorkout } from "@/utils/ActiveWorkoutContext";
import { repeatWorkout, saveWorkoutAsRoutine } from "@/utils/repeatWorkout";
import { sessionDurationMins } from "@/utils/duration";

type WorkoutHistoryCardProps = {
  session_id: number;
  sessionName: string;
  sessionDate: string;
  startTime: string;
  endTime: string | null;
  exerciseCount: number;
  totalVolume: number;
  notes: string | null;
  photo_url?: string | null;
  exerciseNames?: string[];
  onDelete?: (sessionId: number) => void;
  onEditWorkout?: (sessionId: number) => void;
  totalCardioDistanceMeters?: number;
  totalCardioDurationSeconds?: number;
  distanceUnit?: 'km' | 'mi';
};

function rebuildRecordsFor(exerciseIds: string[]) {
  db.getUser()
    .then(({ data }) => data?.user?.id && db.rebuildStrengthRecords(data.user.id, exerciseIds))
    .catch((e: unknown) => logError("WorkoutHistoryCard.rebuildRecords", e));
}

// Parse "YYYY-MM-DD" as local midnight, not UTC midnight
function parseLocalDate(dateStr: string): Date {
  return dateStr.includes("T") ? new Date(dateStr) : new Date(`${dateStr}T00:00:00`);
}

function fullDate(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function relativeDate(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = parseLocalDate(dateStr);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function parseDuration(sessionDate: string, startTime: string, endTime: string | null): string {
  if (!endTime) return "In progress";
  const mins = sessionDurationMins(sessionDate, startTime, endTime);
  if (mins === null) return "—";
  const hrs = Math.floor(mins / 60);
  if (mins === 0) return "<1m";
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins % 60}m`;
}

const WorkoutHistoryCard = memo(function WorkoutHistoryCard({
  session_id,
  sessionName,
  sessionDate,
  startTime,
  endTime,
  exerciseCount,
  totalVolume,
  notes,
  photo_url,
  exerciseNames = [],
  onDelete,
  onEditWorkout,
  totalCardioDistanceMeters = 0,
  totalCardioDurationSeconds = 0,
  distanceUnit = 'km',
}: WorkoutHistoryCardProps) {
  const { colors } = useTheme();
  const photoSrc = useProgressPhotoUrl(photo_url);
  const { toDisplay, label: unitLabel } = useUnits();
  const router = useRouter();

  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [repeating, setRepeating] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [routineName, setRoutineName] = useState("");
  const [savingRoutine, setSavingRoutine] = useState(false);
  const { activeWorkout } = useActiveWorkout();

  const duration = parseDuration(sessionDate, startTime, endTime);
  const volumeDisplay = formatVolume(toDisplay(totalVolume));
  const shown = exerciseNames.slice(0, 3);
  const extra = exerciseNames.length - shown.length;

  const handleShare = async () => {
    setMenuOpen(false);
    const lines = [
      `💪 ${sessionName}`,
      `📅 ${fullDate(sessionDate)}`,
      [
        `⏱ ${duration}`,
        `${exerciseCount} exercise${exerciseCount !== 1 ? "s" : ""}`,
        totalVolume > 0 ? `${volumeDisplay} ${unitLabel}` : null,
        totalCardioDistanceMeters ? formatDistance(totalCardioDistanceMeters, distanceUnit) : null,
      ].filter(Boolean).join("  •  "),
    ];
    if (exerciseNames.length > 0) {
      lines.push("", ...exerciseNames.map((n) => `• ${n}`));
    }
    if (notes) lines.push("", `📝 ${notes}`);
    await Share.share({ message: lines.join("\n") });
  };

  const handleEditOpen = () => {
    setMenuOpen(false);
    if (onEditWorkout) {
      onEditWorkout(session_id);
    } else {
      router.push(`/workout-edit/${session_id}` as any);
    }
  };

  // iOS won't present a modal or alert while the action sheet is still
  // sliding away, so the next one waits for it.
  const afterSheetCloses = (fn: () => void) => {
    setMenuOpen(false);
    setTimeout(fn, Platform.OS === "ios" ? 450 : 0);
  };

  const handleRepeat = () => afterSheetCloses(repeatNow);

  const repeatNow = async () => {
    if (activeWorkout) {
      showAlert("Workout in progress", `Finish or discard "${activeWorkout.sessionName}" before starting another.`);
      return;
    }
    if (repeating) return;
    setRepeating(true);
    try {
      const { data: userData } = await db.getUser();
      const userId = userData?.user?.id;
      if (!userId) return;
      const res = await repeatWorkout(db, session_id, userId);
      if ("error" in res) {
        showAlert("Couldn't repeat workout", res.error);
        return;
      }
      router.push({ pathname: "/workout", params: { sessionId: String(res.sessionId) } });
    } finally {
      setRepeating(false);
    }
  };

  const openSaveAsRoutine = () => afterSheetCloses(() => {
    setRoutineName(sessionName);
    setSaveOpen(true);
  });

  const handleSaveAsRoutine = async () => {
    if (savingRoutine) return;
    setSavingRoutine(true);
    try {
      const { data: userData } = await db.getUser();
      const userId = userData?.user?.id;
      if (!userId) return;
      const res = await saveWorkoutAsRoutine(db, session_id, userId, routineName);
      setSaveOpen(false);
      const name = routineName.trim() || sessionName;
      setTimeout(() => {
        if ("error" in res) showAlert("Couldn't save routine", res.error);
        else showAlert("Routine saved", `"${name}" is in your routines on the Workout tab.`);
      }, Platform.OS === "ios" ? 450 : 0);
    } finally {
      setSavingRoutine(false);
    }
  };

  const handleDelete = () => {
    setMenuOpen(false);
    showAlert(
      "Delete Workout",
      `Delete "${sessionName}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            const { data: exs } = await db.getSessionExercises(session_id);
            const { error } = await db.deleteWorkoutSession(session_id);
            setDeleting(false);
            if (error) {
              showAlert("Couldn't Delete Workout", error.message ?? "Please try again.");
              return;
            }
            onDelete?.(session_id);
            // A PR set in this workout shouldn't outlive it.
            if (!error) rebuildRecordsFor((exs ?? []).map((e: any) => e.exercise_id));
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.card, { borderBottomColor: colors.border, opacity: deleting || repeating ? 0.4 : 1 }]}>
      {/* Date header row */}
      <View style={styles.dateRow}>
        <View style={[styles.dateIcon, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.dateIconText, { color: colors.primary }]}>
            {parseLocalDate(sessionDate).getDate()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sessionName, { color: colors.text }]} numberOfLines={1}>
            {sessionName}
          </Text>
          <Text style={[styles.dateText, { color: colors.textTertiary }]}>
            {relativeDate(sessionDate)}
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.menuBtn, pressed && { opacity: 0.4 }]}
          onPress={() => setMenuOpen(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Workout options"
        >
          <Ionicons name="ellipsis-vertical" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.textSecondary }]}>{duration}</Text>
          <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Duration</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.textSecondary }]}>{exerciseCount}</Text>
          <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Exercises</Text>
        </View>
        {totalVolume > 0 && (
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.textSecondary }]}>{volumeDisplay} {unitLabel}</Text>
            <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Volume</Text>
          </View>
        )}
        {totalCardioDistanceMeters > 0 && (
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.textSecondary }]}>{formatDistance(totalCardioDistanceMeters, distanceUnit)}</Text>
            <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Distance</Text>
          </View>
        )}
        {totalCardioDurationSeconds > 0 && totalCardioDistanceMeters === 0 && (
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.textSecondary }]}>{formatDurationShort(totalCardioDurationSeconds)}</Text>
            <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Cardio</Text>
          </View>
        )}
      </View>

      {/* Exercise list */}
      {shown.length > 0 && (
        <View style={styles.exerciseList}>
          {shown.map((name, i) => (
            <Text key={i} style={[styles.exerciseName, { color: colors.textSecondary }]} numberOfLines={1}>
              {name}
            </Text>
          ))}
          {extra > 0 && (
            <Text style={[styles.moreText, { color: colors.textTertiary }]}>
              +{extra} more exercise{extra > 1 ? "s" : ""}
            </Text>
          )}
        </View>
      )}

      {notes ? (
        <Text style={[styles.notes, { color: colors.textTertiary }]} numberOfLines={2}>{notes}</Text>
      ) : null}

      {photoSrc ? (
        <Pressable onPress={() => setPhotoOpen(true)} style={styles.progressPhotoContainer}>
          <Image source={{ uri: photoSrc }} style={styles.progressPhoto} resizeMode="contain" />
        </Pressable>
      ) : null}

      {/* ── Photo lightbox ── */}
      <Modal visible={photoOpen} transparent animationType="fade" onRequestClose={() => setPhotoOpen(false)}>
        <Pressable style={styles.lightboxOverlay} onPress={() => setPhotoOpen(false)}>
          <Image source={{ uri: photoSrc ?? undefined }} style={styles.lightboxImage} resizeMode="contain" />
        </Pressable>
      </Modal>

      {/* ── Save as routine ── */}
      <ModalShell visible={saveOpen} onClose={() => setSaveOpen(false)} title="Save as Routine">
        <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 8 }}>
          {"Exercises and the sets you completed become the routine’s targets."}
        </Text>
        <TextInput
          value={routineName}
          onChangeText={setRoutineName}
          placeholder="Routine name"
          placeholderTextColor={colors.textTertiary}
          maxLength={60}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleSaveAsRoutine}
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 16, color: colors.text, backgroundColor: colors.inputBackground }}
        />
        <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
          <Pressable
            onPress={() => setSaveOpen(false)}
            style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center", backgroundColor: colors.surfaceSecondary }}
          >
            <Text style={{ fontWeight: "600", color: colors.textSecondary }}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleSaveAsRoutine}
            disabled={savingRoutine}
            style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center", backgroundColor: colors.primary }}
          >
            {savingRoutine
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ fontWeight: "700", color: "#fff" }}>Save</Text>}
          </Pressable>
        </View>
      </ModalShell>

      {/* ── Action sheet ── */}
      <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setMenuOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {sessionName}
            </Text>

            <Pressable
              style={({ pressed }) => [styles.sheetRow, pressed && { backgroundColor: colors.surfaceSecondary }]}
              onPress={handleRepeat}
              accessibilityRole="button"
            >
              <View style={[styles.sheetIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="repeat" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetLabel, { color: colors.text }]}>Repeat Workout</Text>
                <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 1 }}>Same exercises and sets, last numbers as a guide</Text>
              </View>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.sheetRow, pressed && { backgroundColor: colors.surfaceSecondary }]}
              onPress={openSaveAsRoutine}
              accessibilityRole="button"
            >
              <View style={[styles.sheetIcon, { backgroundColor: colors.surfaceSecondary }]}>
                <Ionicons name="bookmark-outline" size={18} color={colors.textSecondary} />
              </View>
              <Text style={[styles.sheetLabel, { color: colors.text }]}>Save as Routine</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.sheetRow, pressed && { backgroundColor: colors.surfaceSecondary }]}
              onPress={handleShare}
            >
              <View style={[styles.sheetIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="share-outline" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.sheetLabel, { color: colors.text }]}>Share</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.sheetRow, pressed && { backgroundColor: colors.surfaceSecondary }]}
              onPress={handleEditOpen}
            >
              <View style={[styles.sheetIcon, { backgroundColor: colors.surfaceSecondary }]}>
                <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
              </View>
              <Text style={[styles.sheetLabel, { color: colors.text }]}>Edit</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.sheetRow, pressed && { backgroundColor: colors.surfaceSecondary }]}
              onPress={handleDelete}
            >
              <View style={[styles.sheetIcon, { backgroundColor: colors.dangerLight }]}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </View>
              <Text style={[styles.sheetLabel, { color: colors.danger }]}>Delete</Text>
            </Pressable>

            <Pressable
              style={[styles.sheetCancel, { backgroundColor: colors.surfaceSecondary }]}
              onPress={() => setMenuOpen(false)}
            >
              <Text style={[styles.sheetCancelText, { color: colors.text }]}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
});

export default WorkoutHistoryCard;

const styles = StyleSheet.create({
  card: {
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  dateIcon: {
    width: 44, height: 44, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  dateIconText: { fontSize: 18, fontWeight: "800" },
  sessionName: { fontSize: 16, fontWeight: "700" },
  dateText: { fontSize: 13, marginTop: 1 },
  menuBtn: { padding: 4 },

  statsRow: { flexDirection: "row", gap: 20, marginBottom: 8 },
  statItem: {},
  statValue: { fontSize: 14, fontWeight: "600" },
  statLabel: { fontSize: 11, fontWeight: "500", marginTop: 1 },

  exerciseList: { gap: 3 },
  exerciseName: { fontSize: 13 },
  moreText: { fontSize: 12, marginTop: 2 },
  notes: { fontSize: 12, fontStyle: "italic", marginTop: 6 },
  progressPhotoContainer: {
    marginTop: 10,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  progressPhoto: {
    width: "100%",
    aspectRatio: 4 / 3,
  },
  lightboxOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  lightboxImage: {
    width: "100%",
    height: "100%",
  },

  // Action sheet
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34, paddingTop: 12 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  sheetTitle: { fontSize: 13, fontWeight: "600", paddingHorizontal: 20, paddingBottom: 10 },
  sheetRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingVertical: 14, paddingHorizontal: 20,
  },
  sheetIcon: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  sheetLabel: { fontSize: 16, fontWeight: "500" },
  sheetCancel: {
    marginHorizontal: 16, marginTop: 8, paddingVertical: 14,
    borderRadius: 12, alignItems: "center",
  },
  sheetCancelText: { fontSize: 16, fontWeight: "600" },
});
