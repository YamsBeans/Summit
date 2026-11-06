import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeContext";
import { useUnits, formatVolume } from "@/utils/units";

type ProfileStatsProps = {
  totalWorkouts: number;
  totalVolume: number;
  totalExercises: number;
};

export default function ProfileStats({ totalWorkouts, totalVolume, totalExercises }: ProfileStatsProps) {
  const { colors } = useTheme();
  const { toDisplay, label: unitLabel } = useUnits();

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.stat}>
        <Text style={[styles.statValue, { color: colors.text }]}>{totalWorkouts}</Text>
        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Workouts</Text>
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.stat}>
        <Text style={[styles.statValue, { color: colors.text }]}>{formatVolume(toDisplay(totalVolume))}</Text>
        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Volume ({unitLabel})</Text>
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.stat}>
        <Text style={[styles.statValue, { color: colors.text }]}>{totalExercises}</Text>
        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Exercises</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row", borderRadius: 12, paddingVertical: 16,
    borderWidth: 1,
  },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { fontSize: 20, fontWeight: "700" },
  statLabel: { fontSize: 12, fontWeight: "600" },
  divider: { width: 1 },
});