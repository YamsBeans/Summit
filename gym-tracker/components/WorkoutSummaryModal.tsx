import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@/theme/ThemeContext";
import { useUnits, formatVolume } from "@/utils/units";
import { formatDistance, formatDurationShort } from "@/utils/cardioUtils";
import { formatWorkoutDuration, type WorkoutSummary } from "@/utils/workoutSummary";

type Props = {
  visible: boolean;
  workoutName: string;
  summary: WorkoutSummary | null;
  distanceUnit: "km" | "mi";
  onAddPhoto: () => void;
  onDone: () => void;
};

/**
 * Post-workout recap, shown after Finish instead of a plain alert. Mirrors
 * the Strong/Hevy "Workout Complete" screen: headline stats, new PRs and
 * each exercise's best set, with the progress photo as an optional extra.
 */
export default function WorkoutSummaryModal({ visible, workoutName, summary, distanceUnit, onAddPhoto, onDone }: Props) {
  const { colors } = useTheme();
  const { toDisplay, label: unitLabel } = useUnits();
  const insets = useSafeAreaInsets();

  if (!summary) return null;

  const hasPRs = summary.prCount > 0;
  const stats: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }[] = [
    { icon: "time-outline", label: "Duration", value: formatWorkoutDuration(summary.durationSeconds) },
    // A cardio-only session has no volume; show its distance instead of "0".
    summary.totalVolumeLbs === 0 && summary.totalDistanceMeters > 0
      ? { icon: "walk-outline", label: "Distance", value: formatDistance(summary.totalDistanceMeters, distanceUnit) }
      : { icon: "barbell-outline", label: `Volume (${unitLabel})`, value: formatVolume(toDisplay(summary.totalVolumeLbs)) },
    { icon: "checkmark-done-outline", label: "Sets", value: String(summary.completedSets) },
    { icon: "trophy-outline", label: "PRs", value: String(summary.prCount) },
  ];

  const bestSetText = (ex: WorkoutSummary["exercises"][number]) => {
    if (ex.isCardio) {
      const parts: string[] = [];
      if (ex.distanceMeters > 0) parts.push(formatDistance(ex.distanceMeters, distanceUnit));
      if (ex.durationSeconds > 0) parts.push(formatDurationShort(ex.durationSeconds));
      return parts.join(" · ") || "—";
    }
    const b = ex.bestSet;
    if (!b) return "—";
    if (b.weight != null && b.weight > 0 && b.reps != null) return `${toDisplay(b.weight)} ${unitLabel} × ${b.reps}`;
    if (b.reps != null) return `${b.reps} reps`;
    if (b.weight != null) return `${toDisplay(b.weight)} ${unitLabel}`;
    return "—";
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onDone}>
      <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.badge, { backgroundColor: hasPRs ? colors.warningLight : colors.successLight }]}>
            <Ionicons name={hasPRs ? "trophy" : "checkmark-circle"} size={40} color={hasPRs ? colors.warning : colors.success} />
          </View>
          <Text style={[styles.kicker, { color: colors.textSecondary }]}>
            {hasPRs ? `${summary.prCount} new PR${summary.prCount === 1 ? "" : "s"}!` : "Nice work!"}
          </Text>
          <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">Workout Complete</Text>
          <Text style={[styles.name, { color: colors.textSecondary }]} numberOfLines={2}>{workoutName}</Text>

          <View style={styles.statsGrid}>
            {stats.map((s) => (
              <View key={s.label} style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name={s.icon} size={18} color={colors.primary} />
                <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{s.value}</Text>
                <Text style={[styles.statLabel, { color: colors.textTertiary }]}>{s.label}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.cardHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.cardHeaderText, { color: colors.textTertiary }]}>EXERCISE</Text>
              <Text style={[styles.cardHeaderText, { color: colors.textTertiary }]}>BEST SET</Text>
            </View>
            {summary.exercises.length === 0 ? (
              <View style={styles.emptyRow}>
                <Ionicons name="information-circle-outline" size={18} color={colors.textTertiary} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  No completed sets. Tick off sets as you go and they&apos;ll show up here.
                </Text>
              </View>
            ) : (
              summary.exercises.map((ex, i) => (
                <View
                  key={`${ex.exerciseId}-${i}`}
                  style={[styles.row, i < summary.exercises.length - 1 && { borderBottomColor: colors.borderLight, borderBottomWidth: StyleSheet.hairlineWidth }]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.exName, { color: colors.text }]} numberOfLines={1}>
                      {ex.completedSets} × {ex.name}
                    </Text>
                    {ex.pr && (
                      <View style={[styles.prPill, { backgroundColor: colors.warningLight }]}>
                        <Ionicons name="trophy" size={11} color={colors.warning} />
                        <Text style={[styles.prText, { color: colors.warning }]}>PR · {ex.pr}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.best, { color: colors.textSecondary }]} numberOfLines={1}>{bestSetText(ex)}</Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Pressable
            style={[styles.secondaryBtn, { backgroundColor: colors.surfaceSecondary }]}
            onPress={onAddPhoto}
            accessibilityRole="button"
            accessibilityLabel="Add progress photo"
          >
            <Ionicons name="camera-outline" size={18} color={colors.text} />
            <Text style={[styles.secondaryText, { color: colors.text }]}>Add Photo</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={onDone}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingTop: 32, alignItems: "center", width: "100%", maxWidth: 560, alignSelf: "center" },
  badge: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  kicker: { fontSize: 14, fontWeight: "600", marginBottom: 4 },
  title: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  name: { fontSize: 15, marginTop: 4, marginBottom: 24, textAlign: "center" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, width: "100%", marginBottom: 16 },
  statCard: {
    flexBasis: "47%", flexGrow: 1, borderRadius: 14, borderWidth: 1,
    paddingVertical: 14, paddingHorizontal: 12, gap: 4,
  },
  statValue: { fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  statLabel: { fontSize: 12, fontWeight: "600" },
  card: { width: "100%", borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  cardHeader: {
    flexDirection: "row", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cardHeaderText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  exName: { fontSize: 15, fontWeight: "600" },
  best: { fontSize: 14, fontWeight: "600", flexShrink: 0 },
  prPill: {
    flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start",
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, marginTop: 4,
  },
  prText: { fontSize: 11, fontWeight: "700" },
  emptyRow: { flexDirection: "row", gap: 8, padding: 14, alignItems: "flex-start" },
  emptyText: { fontSize: 14, flex: 1, lineHeight: 20 },
  footer: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  secondaryBtn: { flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12 },
  secondaryText: { fontSize: 16, fontWeight: "600" },
  primaryBtn: { flex: 1.4, alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12 },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
