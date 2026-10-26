import { memo, useState } from "react";
import { Alert, Image, Modal, Pressable, Share, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { db } from "@/backend/db";
import { useTheme } from "@/theme/ThemeContext";
import { useUnits } from "@/utils/units";

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
};

function fullDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function relativeDate(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function parseDuration(sessionDate: string, startTime: string, endTime: string | null): string {
  if (!endTime) return "In progress";
  const toDate = (t: string) =>
    t.includes("T") || t.length > 10 ? new Date(t) : new Date(`${sessionDate}T${t}`);
  const start = toDate(startTime);
  const end = toDate(endTime);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return "—";
  const ms = end.getTime() - start.getTime();
  if (ms < 0) return "—";
  const mins = Math.floor(ms / 60000);
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
}: WorkoutHistoryCardProps) {
  const { colors } = useTheme();
  const { toDisplay, label: unitLabel } = useUnits();
  const router = useRouter();

  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const duration = parseDuration(sessionDate, startTime, endTime);
  const volumeDisplay = (toDisplay(totalVolume) ?? totalVolume).toLocaleString();
  const shown = exerciseNames.slice(0, 3);
  const extra = exerciseNames.length - shown.length;

  const handleShare = async () => {
    setMenuOpen(false);
    const lines = [
      `💪 ${sessionName}`,
      `📅 ${fullDate(sessionDate)}`,
      `⏱ ${duration}  •  ${exerciseCount} exercise${exerciseCount !== 1 ? "s" : ""}  •  ${volumeDisplay} ${unitLabel}`,
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

  const handleDelete = () => {
    setMenuOpen(false);
    Alert.alert(
      "Delete Workout",
      `Delete "${sessionName}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            await db.deleteWorkoutSession(session_id);
            setDeleting(false);
            onDelete?.(session_id);
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.card, { borderBottomColor: colors.border, opacity: deleting ? 0.4 : 1 }]}>
      {/* Date header row */}
      <View style={styles.dateRow}>
        <View style={[styles.dateIcon, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.dateIconText, { color: colors.primary }]}>
            {new Date(sessionDate).getDate()}
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
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.textSecondary }]}>{volumeDisplay} {unitLabel}</Text>
          <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Volume</Text>
        </View>
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

      {photo_url ? (
        <Image source={{ uri: photo_url }} style={styles.progressPhoto} resizeMode="cover" />
      ) : null}

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
  progressPhoto: {
    width: "100%",
    height: 220,
    borderRadius: 10,
    marginTop: 10,
    overflow: "hidden",
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