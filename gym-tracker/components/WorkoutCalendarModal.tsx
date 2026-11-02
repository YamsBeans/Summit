import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@/theme/ThemeContext";
import { useHeaderTop } from "@/utils/useHeaderTop";
import { monthGrid, shiftMonth, toDateKey } from "@/utils/calendar";
import type { SessionWithMeta } from "./WorkoutHistoryList";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

// Month view of every workout, like the calendars in Strong and Hevy. Tap a
// day to see what you did.
export default function WorkoutCalendarModal({ visible, onClose, sessions }: {
  visible: boolean;
  onClose: () => void;
  sessions: SessionWithMeta[];
}) {
  const { colors } = useTheme();
  const headerTop = useHeaderTop();
  const today = toDateKey(new Date());
  const [{ year, month }, setYM] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selected, setSelected] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const map = new Map<string, SessionWithMeta[]>();
    for (const s of sessions) {
      const key = s.session_date.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return map;
  }, [sessions]);

  const weeks = useMemo(() => monthGrid(year, month), [year, month]);
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthCount = useMemo(
    () => sessions.filter((s) => s.session_date.startsWith(monthKey)).length,
    [sessions, monthKey],
  );
  const title = new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const selectedSessions = selected ? byDate.get(selected) ?? [] : [];

  const go = (delta: number) => {
    setYM(shiftMonth(year, month, delta));
    setSelected(null);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.header, { paddingTop: headerTop, borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Calendar</Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close calendar">
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: "600" }}>Done</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.monthRow}>
              <Pressable onPress={() => go(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous month">
                <Ionicons name="chevron-back" size={22} color={colors.primary} />
              </Pressable>
              <View style={{ alignItems: "center" }}>
                <Text style={[styles.monthTitle, { color: colors.text }]}>{title}</Text>
                <Text style={{ color: colors.textTertiary, fontSize: 12, marginTop: 2 }}>
                  {monthCount === 0 ? "No workouts" : `${monthCount} workout${monthCount === 1 ? "" : "s"}`}
                </Text>
              </View>
              <Pressable onPress={() => go(1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next month">
                <Ionicons name="chevron-forward" size={22} color={colors.primary} />
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAYS.map((d, i) => (
                <Text key={i} style={[styles.weekday, { color: colors.textTertiary }]}>{d}</Text>
              ))}
            </View>

            {weeks.map((week, wi) => (
              <View key={wi} style={styles.weekRow}>
                {week.map((day, di) => {
                  if (!day) return <View key={di} style={styles.cell} />;
                  const has = byDate.has(day);
                  const isSel = selected === day;
                  const isToday = day === today;
                  return (
                    <Pressable
                      key={di}
                      style={styles.cell}
                      onPress={() => setSelected(isSel ? null : day)}
                      accessibilityRole="button"
                      accessibilityLabel={`${day}${has ? `, ${byDate.get(day)!.length} workout` : ""}`}
                    >
                      <View style={[
                        styles.dayCircle,
                        has && { backgroundColor: colors.primary },
                        isSel && { borderWidth: 2, borderColor: colors.text },
                        !has && isToday && { borderWidth: 1.5, borderColor: colors.primary },
                      ]}>
                        <Text style={{
                          fontSize: 14,
                          fontWeight: has || isToday ? "700" : "500",
                          color: has ? "#fff" : isToday ? colors.primary : colors.text,
                        }}>
                          {Number(day.slice(8))}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          {selected && (
            <View style={{ marginTop: 16, gap: 10 }}>
              <Text style={[styles.dayTitle, { color: colors.textSecondary }]}>
                {new Date(`${selected}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </Text>
              {selectedSessions.length === 0 ? (
                <Text style={{ color: colors.textTertiary, fontSize: 14 }}>Rest day.</Text>
              ) : (
                selectedSessions.map((s) => (
                  <View key={s.session_id} style={[styles.card, { backgroundColor: colors.surface }]}>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>{s.session_name}</Text>
                    {s.exerciseNames.length > 0 && (
                      <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }} numberOfLines={3}>
                        {s.exerciseNames.join(" · ")}
                      </Text>
                    )}
                  </View>
                ))
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: "700" },
  card: { borderRadius: 14, padding: 14 },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  monthTitle: { fontSize: 17, fontWeight: "700" },
  weekRow: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", fontSize: 12, fontWeight: "600", marginBottom: 6 },
  cell: { flex: 1, alignItems: "center", paddingVertical: 3 },
  dayCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  dayTitle: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
});
