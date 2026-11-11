import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Polyline } from "react-native-svg";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useTheme } from "@/theme/ThemeContext";
import { useUnits } from "@/utils/units";
import { topLifts, type LiftEntry } from "@/utils/topLifts";

const SPARK_W = 72;
const SPARK_H = 28;

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <View style={{ width: SPARK_W, height: SPARK_H }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (SPARK_W - pad * 2);
    const y = pad + (1 - (v - min) / span) * (SPARK_H - pad * 2);
    return [x, y] as const;
  });
  const [lx, ly] = pts[pts.length - 1];
  return (
    <Svg width={SPARK_W} height={SPARK_H}>
      <Polyline
        points={pts.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Circle cx={lx} cy={ly} r={3} fill={color} />
    </Svg>
  );
}

/**
 * Strength progress at a glance (like Strong's and Hevy's widgets): the
 * lifts done most in the last 90 days, each with its estimated 1RM, the
 * change over the last 30 days and a sparkline of recent sessions. Tap a
 * lift for its full history.
 */
export default function TopLiftsCard({ entries }: { entries: LiftEntry[] }) {
  const { colors } = useTheme();
  const { toDisplay, label: unitLabel } = useUnits();
  const router = useRouter();
  const lifts = useMemo(() => topLifts(entries), [entries]);
  if (lifts.length === 0) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textSecondary }]}>TOP LIFTS</Text>
        <Text style={[styles.sub, { color: colors.textTertiary }]}>Est. 1RM · 30-day change</Text>
      </View>
      {lifts.map((l, i) => {
        const value = Math.round(toDisplay(l.current) ?? l.current);
        // `|| 0` turns a rounded -0 into 0 ("same", not "up 0").
        const delta = l.change == null ? null : Math.round(toDisplay(l.change) ?? l.change) || 0;
        const up = delta != null && delta > 0;
        const down = delta != null && delta < 0;
        const tone = up ? colors.success : down ? colors.danger : colors.textTertiary;
        return (
          <Pressable
            key={l.exerciseId}
            onPress={() => router.push({
              pathname: "/exercise-detail/[exerciseId]",
              params: { exerciseId: l.exerciseId, exerciseName: l.name },
            })}
            style={({ pressed }) => [
              styles.row,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
              pressed && { opacity: 0.6 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${l.name}: estimated one rep max ${value} ${unitLabel}${delta != null ? `, ${delta >= 0 ? "up" : "down"} ${Math.abs(delta)} in 30 days` : ""}`}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{l.name}</Text>
              <View style={styles.valueRow}>
                <Text style={[styles.value, { color: colors.text }]}>
                  {value.toLocaleString()} <Text style={[styles.unit, { color: colors.textSecondary }]}>{unitLabel}</Text>
                </Text>
                {delta != null && (
                  <View style={styles.delta}>
                    <Ionicons
                      name={up ? "arrow-up" : down ? "arrow-down" : "remove"}
                      size={12}
                      color={tone}
                    />
                    <Text style={[styles.deltaText, { color: tone }]}>
                      {delta === 0 ? "same" : `${Math.abs(delta).toLocaleString()} ${unitLabel}`}
                    </Text>
                  </View>
                )}
              </View>
            </View>
            <Sparkline values={l.series} color={colors.primary} />
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6, marginHorizontal: 16, marginBottom: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  title: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  sub: { fontSize: 11, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  name: { fontSize: 14, fontWeight: "600" },
  valueRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  value: { fontSize: 18, fontWeight: "800", fontVariant: ["tabular-nums"] },
  unit: { fontSize: 12, fontWeight: "600" },
  delta: { flexDirection: "row", alignItems: "center", gap: 2 },
  deltaText: { fontSize: 12, fontWeight: "700" },
});
