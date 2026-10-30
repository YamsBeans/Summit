import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LineChart } from "react-native-gifted-charts";
import { useTheme } from "@/theme/ThemeContext";
import { useDistanceUnit } from "@/utils/units";
import { niceAxisMax } from "@/utils/chartScale";
import { computeCardioSummary, formatDistance, formatDuration, formatPaceIn, metersToDisplay } from "@/utils/cardioUtils";

type CardioSet = {
  distance_meters?: number | null;
  duration_seconds?: number | null;
  pace_sec_per_km?: number | null;
  completed?: boolean;
  is_warmup?: boolean | null;
};
type Point = { session_date: string; sets: CardioSet[] };
type Metric = "distance" | "time";

function parseLocalDate(d: string) {
  return new Date(`${d.slice(0, 10)}T12:00:00`);
}

/**
 * Exercise detail for runs, rows, rides…: the strength view showed
 * "Best Weight" and "0 lbs × — reps" for every cardio session.
 */
export default function CardioExerciseDetail({ history }: { history: Point[] }) {
  const { colors } = useTheme();
  const { distanceUnit } = useDistanceUnit();
  const [metric, setMetric] = useState<Metric>("distance");

  const sessions = useMemo(
    () => history.map((h) => ({ date: h.session_date, sets: h.sets, ...computeCardioSummary(h.sets) })),
    [history],
  );

  const bests = useMemo(() => {
    let dist = 0, time = 0;
    let pace: number | null = null;
    for (const s of sessions) {
      dist = Math.max(dist, s.totalDistanceMeters);
      time = Math.max(time, s.totalDurationSeconds);
      if (s.bestPaceSecPerKm != null && (pace == null || s.bestPaceSecPerKm < pace)) pace = s.bestPaceSecPerKm;
    }
    return { dist, time, pace };
  }, [sessions]);

  const chartData = useMemo(() => sessions
    .map((s) => {
      const v = metric === "distance"
        ? Math.round(metersToDisplay(s.totalDistanceMeters, distanceUnit) * 100) / 100
        : Math.round(s.totalDurationSeconds / 6) / 10; // minutes, 1 dp
      if (!(v > 0)) return null;
      return {
        value: v,
        label: parseLocalDate(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        dataPointText: String(v),
      };
    })
    .filter(Boolean) as { value: number; label: string; dataPointText: string }[],
  [sessions, metric, distanceUnit]);

  const top = Math.max(0, ...chartData.map((d) => d.value)) * 1.1;
  // Short distances (a 0.4 km row) need fractional steps to be readable.
  const chartMax = top > 0 && top < 4 ? Math.ceil(top / 0.4) * 0.4 : niceAxisMax(top);

  const tiles = [
    bests.dist > 0 && { value: formatDistance(bests.dist, distanceUnit), label: "Longest", color: colors.primary, bg: colors.primaryLight },
    bests.time > 0 && { value: formatDuration(bests.time), label: "Longest Time", color: colors.success, bg: colors.successLight },
    bests.pace != null && { value: formatPaceIn(bests.pace, distanceUnit).split(" ")[0], label: `Best Pace (/${distanceUnit})`, color: colors.warning, bg: colors.warningLight },
  ].filter(Boolean) as { value: string; label: string; color: string; bg: string }[];

  return (
    <>
      {tiles.length > 0 && (
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
          {tiles.map((t) => (
            <View key={t.label} style={{ flex: 1, backgroundColor: t.bg, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 8, alignItems: "center" }}>
              <Text style={{ fontSize: 20, fontWeight: "800", color: t.color }} numberOfLines={1} adjustsFontSizeToFit>{t.value}</Text>
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.textSecondary, marginTop: 2, textAlign: "center" }}>{t.label}</Text>
            </View>
          ))}
        </View>
      )}

      {history.length >= 2 ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 20 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: colors.text }}>
              Progress ({metric === "distance" ? distanceUnit : "min"})
            </Text>
            <View style={{ flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: 8, padding: 2 }}>
              {([["distance", "Distance"], ["time", "Time"]] as const).map(([key, label]) => (
                <Pressable
                  key={key}
                  onPress={() => setMetric(key)}
                  style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: metric === key ? colors.primary : "transparent" }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: metric === key }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: metric === key ? "#fff" : colors.textSecondary }}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          {chartData.length >= 2 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <LineChart
                key={metric}
                data={chartData}
                width={Math.max(300, chartData.length * 60)}
                height={180}
                color={colors.primary}
                dataPointsColor={colors.primary}
                dataPointsRadius={5}
                thickness={2.5}
                startFillColor={colors.primary}
                startOpacity={0.25}
                endFillColor={colors.surface}
                endOpacity={0}
                areaChart
                curved
                xAxisColor={colors.border}
                yAxisColor={colors.border}
                yAxisTextStyle={{ color: colors.textSecondary, fontSize: 11 }}
                xAxisLabelTextStyle={{ color: colors.textSecondary, fontSize: 10 }}
                textColor={colors.textSecondary}
                textFontSize={10}
                textShiftY={-6}
                textShiftX={-6}
                maxValue={chartMax}
                noOfSections={4}
                rulesColor={colors.border}
                rulesType="dashed"
                spacing={60}
                initialSpacing={20}
              />
            </ScrollView>
          ) : (
            <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: "center", paddingVertical: 24 }}>
              {metric === "distance" ? "Log a distance in two workouts to chart it." : "Log a time in two workouts to chart it."}
            </Text>
          )}
        </View>
      ) : history.length === 1 ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, alignItems: "center", marginBottom: 20 }}>
          <Ionicons name="trending-up-outline" size={22} color={colors.textTertiary} />
          <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 6, textAlign: "center" }}>
            Log this exercise in one more workout to see your progress chart
          </Text>
        </View>
      ) : null}

      <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 12 }}>Session History</Text>
      {sessions.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 32, gap: 8 }}>
          <Ionicons name="walk-outline" size={36} color={colors.textTertiary} />
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>No history yet</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: "center" }}>Completed sets of this exercise will show up here.</Text>
        </View>
      ) : (
        [...sessions].reverse().map((s, i) => (
          <View key={`${s.date}-${i}`} style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={{ fontWeight: "700", color: colors.text }}>
                {parseLocalDate(s.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{s.sets.length} set{s.sets.length !== 1 ? "s" : ""}</Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 4 }}>
              {s.totalDistanceMeters > 0 && (
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                  Distance: <Text style={{ fontWeight: "700", color: colors.primary }}>{formatDistance(s.totalDistanceMeters, distanceUnit)}</Text>
                </Text>
              )}
              {s.totalDurationSeconds > 0 && (
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                  Time: <Text style={{ fontWeight: "700", color: colors.text }}>{formatDuration(s.totalDurationSeconds)}</Text>
                </Text>
              )}
              {s.bestPaceSecPerKm != null && (
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                  Pace: <Text style={{ fontWeight: "700", color: colors.text }}>{formatPaceIn(s.bestPaceSecPerKm, distanceUnit)}</Text>
                </Text>
              )}
            </View>
            {s.sets.length > 1 && (
              <View style={{ marginTop: 8, gap: 3 }}>
                {s.sets.map((set, si) => (
                  <Text key={si} style={{ fontSize: 12, color: colors.textTertiary }}>
                    Set {si + 1}: {set.distance_meters ? formatDistance(set.distance_meters, distanceUnit) : "—"} · {set.duration_seconds ? formatDuration(set.duration_seconds) : "—"}
                  </Text>
                ))}
              </View>
            )}
          </View>
        ))
      )}
    </>
  );
}
