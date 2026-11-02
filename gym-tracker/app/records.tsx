import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import exercisesData from "@/assets/data/exercises.json";
import { db } from "@/backend/db";
import { useTheme } from "@/theme/ThemeContext";
import { useHeaderTop } from "@/utils/useHeaderTop";
import { useDistanceUnit, useUnits, formatVolume } from "@/utils/units";
import { formatDistance, formatDurationShort, formatPaceIn } from "@/utils/cardioUtils";
import { buildRecordRows, RecordRow } from "@/utils/records";

// Every personal record in one list (like Strong's "Records"), newest first
// or by name, with a search box. Tap one for the exercise's history.
export default function RecordsScreen() {
  const headerTop = useHeaderTop();
  const router = useRouter();
  const { colors } = useTheme();
  const { toDisplay, label: unitLabel } = useUnits();
  const { distanceUnit } = useDistanceUnit();
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "name">("recent");

  const load = useCallback(async () => {
    const { data: userData } = await db.getUser();
    const userId = userData?.user?.id;
    if (!userId) { setLoading(false); return; }
    const [{ data: prs }, { data: customs }] = await Promise.all([
      db.getPersonalRecords(userId),
      db.getCustomExercises(userId),
    ]);
    setRows(buildRecordRows(prs ?? [], exercisesData as any[], customs ?? []));
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
    return sort === "name"
      ? [...list].sort((a, b) => a.name.localeCompare(b.name))
      : list;
  }, [rows, query, sort]);

  const renderValue = (r: RecordRow) => {
    if (r.type === "cardio") {
      const parts = [
        r.bestDistanceMeters ? formatDistance(r.bestDistanceMeters, distanceUnit) : null,
        r.bestPaceSecPerKm ? formatPaceIn(r.bestPaceSecPerKm, distanceUnit) : null,
        !r.bestDistanceMeters && r.bestDurationSeconds ? formatDurationShort(r.bestDurationSeconds) : null,
      ].filter(Boolean);
      return parts.join(" · ") || "—";
    }
    const parts = [
      r.maxWeight ? `${formatVolume(toDisplay(r.maxWeight))} ${unitLabel}` : null,
      r.maxVolume ? `${formatVolume(toDisplay(r.maxVolume))} ${unitLabel} vol` : null,
    ].filter(Boolean);
    return parts.join(" · ") || "—";
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{
        flexDirection: "row", alignItems: "center", paddingTop: headerTop,
        paddingHorizontal: 16, paddingBottom: 14,
        borderBottomWidth: 1, borderBottomColor: colors.border,
        backgroundColor: colors.headerBackground,
      }}>
        <Pressable style={{ width: 40 }} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={28} color={colors.primary} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: colors.text, textAlign: "center" }}>
          Personal Records
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : rows.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Ionicons name="trophy-outline" size={44} color={colors.textTertiary} />
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700", marginTop: 12 }}>No records yet</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: "center", marginTop: 6 }}>
            Finish a workout with completed sets and your bests will show up here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(r) => `${r.exerciseId}:${r.type}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 40 }}
          ListHeaderComponent={
            <View style={{ padding: 16, gap: 10 }}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search records"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10,
                  fontSize: 15, color: colors.text, backgroundColor: colors.inputBackground,
                }}
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["recent", "name"] as const).map((k) => (
                  <Pressable
                    key={k}
                    onPress={() => setSort(k)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: sort === k }}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 5, borderRadius: 999, borderWidth: 1,
                      backgroundColor: sort === k ? colors.primary : colors.surfaceSecondary,
                      borderColor: sort === k ? colors.primary : colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: sort === k ? "#fff" : colors.textSecondary }}>
                      {k === "recent" ? "Most recent" : "A–Z"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          }
          ListEmptyComponent={
            <Text style={{ textAlign: "center", color: colors.textTertiary, marginTop: 24 }}>No records match “{query}”</Text>
          }
          renderItem={({ item: r }) => (
            <Pressable
              onPress={() => router.push({
                pathname: "/exercise-detail/[exerciseId]",
                params: { exerciseId: r.exerciseId, exerciseName: r.name, exerciseType: r.type === "cardio" ? "cardio" : "" },
              })}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", gap: 12,
                paddingHorizontal: 16, paddingVertical: 12,
                borderBottomWidth: 1, borderBottomColor: colors.borderLight,
                backgroundColor: pressed ? colors.surfaceSecondary : colors.background,
              })}
            >
              <View style={{
                width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center",
                backgroundColor: colors.warningLight,
              }}>
                <Ionicons name={r.type === "cardio" ? "walk-outline" : "trophy-outline"} size={16} color={colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }} numberOfLines={1}>{r.name}</Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>{renderValue(r)}</Text>
              </View>
              {r.achievedAt ? (
                <Text style={{ fontSize: 12, color: colors.textTertiary }}>
                  {new Date(r.achievedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </Text>
              ) : null}
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
