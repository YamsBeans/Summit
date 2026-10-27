import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LineChart } from "react-native-gifted-charts";
import { db } from "@/backend/db";
import { useTheme } from "@/theme/ThemeContext";
import { useUnits } from "@/utils/units";

type HistoryPoint = {
  session_date: string;
  sets: Array<{ weight: number | null; reps: number | null; completed: boolean }>;
};

export default function ExerciseDetailScreen() {
  const { exerciseId, exerciseName } = useLocalSearchParams<{ exerciseId: string; exerciseName: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { toDisplay, label: unitLabel } = useUnits();
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [pr, setPr] = useState<{ weight: number | null; volume: number | null }>({ weight: null, volume: null });

  useEffect(() => {
    const load = async () => {
      const { data: userData } = await db.getUser();
      const userId = userData?.user?.id;
      if (!userId) { setLoading(false); return; }

      const [histRes, prRes] = await Promise.all([
        db.getExerciseHistory(exerciseId, userId),
        db.getPersonalRecords(userId),
      ]);

      setHistory((histRes.data ?? []) as HistoryPoint[]);

      const exercisePR = (prRes.data ?? []).find((r: any) => r.exercise_id === exerciseId);
      if (exercisePR) setPr({ weight: exercisePR.max_weight, volume: exercisePR.max_volume });

      setLoading(false);
    };
    load();
  }, [exerciseId]);

  const chartData = history.map((h) => {
    const maxWeight = h.sets.reduce((m, s) => (s.weight != null && s.weight > m ? s.weight : m), 0);
    return {
      value: toDisplay(maxWeight) ?? maxWeight,
      label: new Date(h.session_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      dataPointText: String(toDisplay(maxWeight) ?? maxWeight),
    };
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{
        flexDirection: "row", alignItems: "center", paddingTop: 60,
        paddingHorizontal: 16, paddingBottom: 14,
        borderBottomWidth: 1, borderBottomColor: colors.border,
        backgroundColor: colors.headerBackground,
      }}>
        <Pressable style={{ width: 40 }} onPress={() => router.back()}>
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
          {/* PR Badges */}
          {(pr.weight || pr.volume) && (
            <View style={{ flexDirection: "row", gap: 12, marginBottom: 20 }}>
              {pr.weight != null && (
                <View style={{ flex: 1, backgroundColor: colors.primaryLight, borderRadius: 12, padding: 14, alignItems: "center" }}>
                  <Text style={{ fontSize: 22, fontWeight: "800", color: colors.primary }}>
                    {toDisplay(pr.weight) ?? pr.weight} {unitLabel}
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.textSecondary, marginTop: 2 }}>Best Weight</Text>
                </View>
              )}
              {pr.volume != null && (
                <View style={{ flex: 1, backgroundColor: colors.successLight, borderRadius: 12, padding: 14, alignItems: "center" }}>
                  <Text style={{ fontSize: 22, fontWeight: "800", color: colors.success }}>
                    {(toDisplay(pr.volume) ?? pr.volume)?.toLocaleString()}
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.textSecondary, marginTop: 2 }}>Best Volume ({unitLabel})</Text>
                </View>
              )}
            </View>
          )}

          {/* Chart */}
          {chartData.length >= 2 ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 20 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: 12 }}>
                Max Weight per Session ({unitLabel})
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <LineChart
                  data={chartData}
                  width={Math.max(300, chartData.length * 60)}
                  height={180}
                  color={colors.primary}
                  dataPointsColor={colors.primary}
                  dataPointsRadius={5}
                  thickness={2.5}
                  startFillColor={colors.primaryLight}
                  endFillColor="transparent"
                  areaChart
                  curved
                  xAxisColor={colors.border}
                  yAxisColor={colors.border}
                  yAxisTextStyle={{ color: colors.textSecondary, fontSize: 11 }}
                  xAxisLabelTextStyle={{ color: colors.textSecondary, fontSize: 10 }}
                  hideRules
                  spacing={60}
                  initialSpacing={20}
                />
              </ScrollView>
            </View>
          ) : chartData.length === 1 ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, alignItems: "center", marginBottom: 20 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Complete more sessions to see a progression chart</Text>
            </View>
          ) : null}

          {/* Session History List */}
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 12 }}>Session History</Text>
          {history.length === 0 ? (
            <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: "center", marginTop: 20 }}>
              No completed sessions recorded for this exercise yet.
            </Text>
          ) : (
            [...history].reverse().map((h, i) => {
              const maxW = h.sets.reduce((m, s) => (s.weight != null && s.weight > m ? s.weight : m), 0);
              const totalVol = h.sets.reduce((sum, s) => s.weight && s.reps ? sum + s.weight * s.reps : sum, 0);
              return (
                <View key={i} style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 10 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                    <Text style={{ fontWeight: "700", color: colors.text }}>
                      {new Date(h.session_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                      {h.sets.length} set{h.sets.length !== 1 ? "s" : ""}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 16 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                      Best: <Text style={{ fontWeight: "700", color: colors.primary }}>{toDisplay(maxW) ?? maxW} {unitLabel}</Text>
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                      Vol: <Text style={{ fontWeight: "700", color: colors.text }}>{(toDisplay(totalVol) ?? totalVol).toLocaleString()} {unitLabel}</Text>
                    </Text>
                  </View>
                  <View style={{ marginTop: 8, gap: 3 }}>
                    {h.sets.map((s, si) => (
                      <Text key={si} style={{ fontSize: 12, color: colors.textTertiary }}>
                        Set {si + 1}: {toDisplay(s.weight) ?? s.weight ?? "—"} {unitLabel} × {s.reps ?? "—"} reps
                      </Text>
                    ))}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}
