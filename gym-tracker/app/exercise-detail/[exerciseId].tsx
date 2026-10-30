import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LineChart } from "react-native-gifted-charts";
import { db } from "@/backend/db";
import { useTheme } from "@/theme/ThemeContext";
import { useUnits, formatVolume } from "@/utils/units";
import { bestOneRepMax, estimateOneRepMax } from "@/utils/oneRepMax";
import CardioExerciseDetail from "@/components/CardioExerciseDetail";

type HistorySet = {
  weight: number | null; reps: number | null; completed: boolean; is_warmup?: boolean | null;
  distance_meters?: number | null; duration_seconds?: number | null; pace_sec_per_km?: number | null;
};
type HistoryPoint = {
  session_date: string;
  sets: HistorySet[];
};

type ChartMetric = "weight" | "e1rm";

// session_date is a plain "YYYY-MM-DD". new Date("2026-10-28") parses as UTC
// midnight, which shows as the previous day anywhere west of London — so pin
// it to local noon before formatting.
function parseLocalDate(d: string) {
  return new Date(`${d.slice(0, 10)}T12:00:00`);
}

function maxWeight(sets: HistorySet[]) {
  return sets.reduce((m, s) => (s.weight != null && s.weight > m ? s.weight : m), 0);
}

export default function ExerciseDetailScreen() {
  const { exerciseId, exerciseName, exerciseType } = useLocalSearchParams<{ exerciseId: string; exerciseName: string; exerciseType?: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { toDisplay, label: unitLabel } = useUnits();
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [pr, setPr] = useState<{ weight: number | null; volume: number | null }>({ weight: null, volume: null });
  const [metric, setMetric] = useState<ChartMetric>("weight");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data: userData } = await db.getUser();
        const userId = userData?.user?.id;
        if (!userId) return;

        const [histRes, prRes] = await Promise.all([
          db.getExerciseHistory(exerciseId, userId),
          db.getPersonalRecords(userId),
        ]);
        if (cancelled) return;

        const points = ((histRes.data ?? []) as HistoryPoint[])
          .filter((h) => h.sets.length > 0)
          .sort((a, b) => a.session_date.localeCompare(b.session_date));
        setHistory(points);

        const exercisePR = (prRes.data ?? []).find((r: any) => r.exercise_id === exerciseId && r.pr_type !== "cardio");
        if (exercisePR) setPr({ weight: exercisePR.max_weight, volume: exercisePR.max_volume });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [exerciseId]);

  // Best numbers, preferring what the history actually shows (the PR table
  // can lag behind edits made to past workouts).
  const bests = useMemo(() => {
    const allSets = history.flatMap((h) => h.sets);
    const histWeight = maxWeight(allSets);
    const histVolume = history.reduce((m, h) => {
      const v = h.sets.reduce((sum, s) => (s.weight && s.reps ? sum + s.weight * s.reps : sum), 0);
      return v > m ? v : m;
    }, 0);
    return {
      weight: Math.max(histWeight, pr.weight ?? 0) || null,
      volume: Math.max(histVolume, pr.volume ?? 0) || null,
      e1rm: bestOneRepMax(allSets),
    };
  }, [history, pr]);

  const chartData = useMemo(() => {
    return history
      .map((h) => {
        const raw = metric === "weight" ? maxWeight(h.sets) : bestOneRepMax(h.sets);
        if (!raw) return null;
        const v = toDisplay(raw) ?? raw;
        return {
          value: v,
          label: parseLocalDate(h.session_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          dataPointText: String(Math.round(v)),
        };
      })
      .filter(Boolean) as { value: number; label: string; dataPointText: string }[];
  }, [history, metric, toDisplay]);

  // Round the y-axis to friendly numbers (0/50/100/150…) instead of 17, 34, 51…
  const chartMax = useMemo(() => {
    const top = Math.max(0, ...chartData.map((d) => d.value));
    if (top <= 0) return 10;
    const sections = 4;
    const rawStep = (top * 1.1) / sections;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((c) => c >= rawStep) ?? 10 * mag;
    return step * sections;
  }, [chartData]);

  // Cardio gets its own view (distance/time/pace). Detect it from the data too,
  // for entry points that don't pass the type.
  const isCardio = useMemo(() => {
    if (exerciseType) return exerciseType === "cardio";
    const sets = history.flatMap((h) => h.sets);
    return sets.length > 0
      && sets.some((s) => (s.distance_meters ?? 0) > 0 || (s.duration_seconds ?? 0) > 0)
      && !sets.some((s) => (s.weight ?? 0) > 0 || (s.reps ?? 0) > 0);
  }, [exerciseType, history]);

  const hasBests = bests.weight != null || bests.volume != null || bests.e1rm != null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{
        flexDirection: "row", alignItems: "center", paddingTop: 60,
        paddingHorizontal: 16, paddingBottom: 14,
        borderBottomWidth: 1, borderBottomColor: colors.border,
        backgroundColor: colors.headerBackground,
      }}>
        <Pressable style={{ width: 40 }} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={28} color={colors.primary} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: colors.text, textAlign: "center" }} numberOfLines={1}>
          {exerciseName ?? exerciseId}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {isCardio ? <CardioExerciseDetail history={history} /> : <>
          {/* Personal bests */}
          {hasBests ? (
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
              {bests.weight != null && (
                <StatTile
                  value={`${toDisplay(bests.weight)}`}
                  label={`Best Weight (${unitLabel})`}
                  color={colors.primary}
                  bg={colors.primaryLight}
                  labelColor={colors.textSecondary}
                />
              )}
              {bests.e1rm != null && (
                <StatTile
                  value={`${Math.round(toDisplay(bests.e1rm) ?? bests.e1rm)}`}
                  label={`Est. 1RM (${unitLabel})`}
                  color={colors.warning}
                  bg={colors.warningLight}
                  labelColor={colors.textSecondary}
                />
              )}
              {bests.volume != null && (
                <StatTile
                  value={formatVolume(toDisplay(bests.volume))}
                  label={`Best Volume (${unitLabel})`}
                  color={colors.success}
                  bg={colors.successLight}
                  labelColor={colors.textSecondary}
                />
              )}
            </View>
          ) : null}

          {/* Chart */}
          {history.length >= 2 ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 20 }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: colors.text }}>
                  Progress ({unitLabel})
                </Text>
                <View style={{ flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: 8, padding: 2 }}>
                  {([["weight", "Max Weight"], ["e1rm", "Est. 1RM"]] as const).map(([key, label]) => (
                    <Pressable
                      key={key}
                      onPress={() => setMetric(key)}
                      style={{
                        paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
                        backgroundColor: metric === key ? colors.primary : "transparent",
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: metric === key }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "700", color: metric === key ? "#fff" : colors.textSecondary }}>
                        {label}
                      </Text>
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
                  {metric === "e1rm"
                    ? "Log sets of 1–12 reps to estimate your 1RM."
                    : "Not enough weighted sets to chart yet."}
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

          {/* Session History List */}
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 12 }}>Session History</Text>
          {history.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 32, gap: 8 }}>
              <Ionicons name="barbell-outline" size={36} color={colors.textTertiary} />
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>No history yet</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: "center" }}>
                Completed sets of this exercise will show up here.
              </Text>
            </View>
          ) : (
            [...history].reverse().map((h, i) => {
              const maxW = maxWeight(h.sets);
              const totalVol = h.sets.reduce((sum, s) => s.weight && s.reps ? sum + s.weight * s.reps : sum, 0);
              const e1rm = bestOneRepMax(h.sets);
              let bestIdx = -1;
              let bestE = -1;
              h.sets.forEach((s, si) => {
                const e = s.is_warmup ? null : estimateOneRepMax(s.weight, s.reps);
                if (e != null && e > bestE) { bestE = e; bestIdx = si; }
              });
              return (
                <View key={`${h.session_date}-${i}`} style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 10 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                    <Text style={{ fontWeight: "700", color: colors.text }}>
                      {parseLocalDate(h.session_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                      {h.sets.length} set{h.sets.length !== 1 ? "s" : ""}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 4 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                      Best: <Text style={{ fontWeight: "700", color: colors.primary }}>{toDisplay(maxW) ?? maxW} {unitLabel}</Text>
                    </Text>
                    {e1rm != null && (
                      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                        1RM: <Text style={{ fontWeight: "700", color: colors.text }}>{Math.round(toDisplay(e1rm) ?? e1rm)} {unitLabel}</Text>
                      </Text>
                    )}
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                      Vol: <Text style={{ fontWeight: "700", color: colors.text }}>{formatVolume(toDisplay(totalVol))} {unitLabel}</Text>
                    </Text>
                  </View>
                  <View style={{ marginTop: 8, gap: 3 }}>
                    {h.sets.map((s, si) => (
                      <Text key={si} style={{ fontSize: 12, color: si === bestIdx ? colors.text : colors.textTertiary, fontWeight: si === bestIdx ? "600" : "400" }}>
                        {s.is_warmup ? "W" : `Set ${si + 1}`}: {toDisplay(s.weight) ?? "—"} {unitLabel} × {s.reps ?? "—"} reps
                        {si === bestIdx && h.sets.length > 1 ? "  ★" : ""}
                      </Text>
                    ))}
                  </View>
                </View>
              );
            })
          )}
          </>}
        </ScrollView>
      )}
    </View>
  );
}

function StatTile({ value, label, color, bg, labelColor }: { value: string; label: string; color: string; bg: string; labelColor: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: bg, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 8, alignItems: "center" }}>
      <Text style={{ fontSize: 20, fontWeight: "800", color }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={{ fontSize: 11, fontWeight: "600", color: labelColor, marginTop: 2, textAlign: "center" }} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}
