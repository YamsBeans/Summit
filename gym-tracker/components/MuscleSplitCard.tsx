import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeContext";
import { toDateKey } from "@/utils/calendar";
import { muscleSplit, type SplitEntry } from "@/utils/muscleSplit";

const RANGES = [
  { key: 7, label: "7D" },
  { key: 30, label: "30D" },
] as const;

/**
 * Working sets per muscle group over the last 7 or 30 days, as bars, so an
 * imbalance (lots of chest, no back) is easy to spot. Like Hevy's muscle
 * distribution.
 */
export default function MuscleSplitCard({ entries, musclesOf }: {
  entries: SplitEntry[];
  musclesOf: (exerciseId: string) => string[] | null | undefined;
}) {
  const { colors } = useTheme();
  const [days, setDays] = useState<7 | 30>(30);

  const rows = useMemo(() => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));
    return muscleSplit(entries, musclesOf, toDateKey(since));
  }, [entries, musclesOf, days]);

  const max = Math.max(0, ...rows.map((r) => r.sets));
  const total = rows.reduce((n, r) => n + r.sets, 0);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textSecondary }]}>MUSCLE SPLIT</Text>
        <View style={[styles.segment, { backgroundColor: colors.surfaceSecondary }]}>
          {RANGES.map((r) => {
            const active = days === r.key;
            return (
              <Pressable
                key={r.key}
                onPress={() => setDays(r.key)}
                style={[styles.segBtn, active && { backgroundColor: colors.primary }]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Last ${r.key} days`}
              >
                <Text style={[styles.segText, { color: active ? "#fff" : colors.textSecondary }]}>{r.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {total === 0 ? (
        <Text style={[styles.empty, { color: colors.textTertiary }]}>
          No strength sets in the last {days} days. Finish a workout to see which muscles you&apos;re training.
        </Text>
      ) : (
        <>
          {rows.map((r) => (
            <View key={r.key} style={styles.row} accessibilityLabel={`${r.label}: ${r.sets} sets`}>
              <Text style={[styles.label, { color: r.sets ? colors.text : colors.textTertiary }]}>{r.label}</Text>
              <View style={[styles.track, { backgroundColor: colors.surfaceSecondary }]}>
                {r.sets > 0 && (
                  <View style={[styles.fill, { backgroundColor: colors.primary, width: `${Math.max(4, (r.sets / max) * 100)}%` }]} />
                )}
              </View>
              <Text style={[styles.count, { color: r.sets ? colors.text : colors.textTertiary }]}>{r.sets}</Text>
            </View>
          ))}
          <Text style={[styles.foot, { color: colors.textTertiary }]}>
            {total} working {total === 1 ? "set" : "sets"} · warm-ups not counted
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 16, marginHorizontal: 16, marginBottom: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  title: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  segment: { flexDirection: "row", borderRadius: 8, padding: 2 },
  segBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  segText: { fontSize: 12, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  label: { width: 72, fontSize: 14, fontWeight: "600" },
  track: { flex: 1, height: 10, borderRadius: 5, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 5 },
  count: { width: 28, textAlign: "right", fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },
  empty: { fontSize: 13, lineHeight: 18 },
  foot: { fontSize: 12, marginTop: 2 },
});
