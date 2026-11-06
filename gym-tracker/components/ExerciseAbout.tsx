import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@/theme/ThemeContext";
import exercisesData from "@/assets/data/exercises.json";

type LibraryExercise = {
  id: string;
  equipment?: string | null;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  instructions?: string[];
  level?: string;
};

const capitalize = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * "About" card on exercise detail (like Strong's About tab): equipment,
 * muscles worked, and step-by-step instructions from the exercise library.
 * Renders nothing for custom exercises.
 */
export default function ExerciseAbout({ exerciseId }: { exerciseId: string }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const ex = useMemo(
    () => (exercisesData as LibraryExercise[]).find((e) => e.id === exerciseId),
    [exerciseId],
  );
  if (!ex) return null;

  const steps = ex.instructions ?? [];
  const equipment = ex.equipment && ex.equipment !== "other" ? capitalize(ex.equipment) : null;
  const primary = (ex.primaryMuscles ?? []).map(capitalize);
  const secondary = (ex.secondaryMuscles ?? []).map(capitalize);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
        <Text style={[styles.title, { color: colors.text }]}>About</Text>
      </View>

      {(equipment || primary.length > 0) && (
        <View style={styles.chips}>
          {equipment && (
            <View style={[styles.chip, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.chipText, { color: colors.textSecondary }]}>{equipment}</Text>
            </View>
          )}
          {primary.map((m) => (
            <View key={m} style={[styles.chip, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.chipText, { color: colors.primary }]}>{m}</Text>
            </View>
          ))}
        </View>
      )}
      {secondary.length > 0 && (
        <Text style={[styles.secondary, { color: colors.textSecondary }]}>Also works: {secondary.join(", ")}</Text>
      )}

      {steps.length > 0 && (
        <>
          <Pressable
            onPress={() => setOpen((o) => !o)}
            style={[styles.toggle, { borderTopColor: colors.border }]}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
          >
            <Text style={[styles.toggleText, { color: colors.text }]}>How to do it</Text>
            <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textTertiary} />
          </Pressable>
          {open && steps.map((step, i) => (
            <View key={i} style={styles.step}>
              <View style={[styles.stepNum, { backgroundColor: colors.surfaceSecondary }]}>
                <Text style={[styles.stepNumText, { color: colors.textSecondary }]}>{i + 1}</Text>
              </View>
              <Text style={[styles.stepText, { color: colors.textSecondary }]}>{step}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 8 },
  header: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  title: { fontSize: 15, fontWeight: "700" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  chipText: { fontSize: 12, fontWeight: "700" },
  secondary: { fontSize: 13, marginTop: 8 },
  toggle: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth,
  },
  toggleText: { fontSize: 14, fontWeight: "600" },
  step: { flexDirection: "row", gap: 10, marginTop: 10 },
  stepNum: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", marginTop: 1 },
  stepNumText: { fontSize: 12, fontWeight: "700" },
  stepText: { flex: 1, fontSize: 14, lineHeight: 20 },
});
