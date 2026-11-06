import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@/theme/ThemeContext";

type Props = {
  remaining: number;
  /** Full length of the current rest period, used for the progress bar. */
  total?: number;
  onSkip: () => void;
  onAddTime: (secs: number) => void;
};

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function RestTimerBanner({ remaining, total, onSkip, onAddTime }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  if (remaining <= 0) return null;

  const progress = total && total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 1;
  const almostDone = remaining <= 10;

  return (
    <View style={[styles.wrapper, { bottom: Math.max(insets.bottom, 12) + 12 }]} pointerEvents="box-none">
      <View
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: "#000" }]}
        accessibilityRole="timer"
        accessibilityLabel={`Rest timer, ${fmt(remaining)} remaining`}
      >
        <View style={styles.row}>
          <Ionicons name="timer-outline" size={18} color={almostDone ? colors.warning : colors.primary} />
          <Text style={[styles.timer, { color: almostDone ? colors.warning : colors.text }]}>{fmt(remaining)}</Text>

          <View style={styles.btnRow}>
            <Pressable
              onPress={() => onAddTime(-15)}
              style={({ pressed }) => [styles.btn, { backgroundColor: colors.surfaceSecondary }, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Subtract 15 seconds"
              hitSlop={4}
            >
              <Text style={[styles.btnText, { color: colors.textSecondary }]}>−15s</Text>
            </Pressable>
            <Pressable
              onPress={() => onAddTime(30)}
              style={({ pressed }) => [styles.btn, { backgroundColor: colors.surfaceSecondary }, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Add 30 seconds"
              hitSlop={4}
            >
              <Text style={[styles.btnText, { color: colors.primary }]}>+30s</Text>
            </Pressable>
            <Pressable
              onPress={onSkip}
              style={({ pressed }) => [styles.btn, { backgroundColor: colors.primary }, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Skip rest"
              hitSlop={4}
            >
              <Text style={[styles.btnText, { color: "#fff" }]}>Skip</Text>
            </Pressable>
          </View>
        </View>

        {/* Progress — shrinks as the rest period runs out */}
        <View style={[styles.track, { backgroundColor: colors.surfaceSecondary }]}>
          <View
            style={[
              styles.fill,
              { width: `${progress * 100}%`, backgroundColor: almostDone ? colors.warning : colors.primary },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
  },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingHorizontal: 14,
    paddingBottom: 10,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 8,
    width: "100%",
    maxWidth: 560,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  timer: {
    fontSize: 22,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    flex: 1,
  },
  btnRow: {
    flexDirection: "row",
    gap: 6,
  },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  pressed: { opacity: 0.7 },
  btnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  track: {
    height: 4,
    borderRadius: 2,
    marginTop: 10,
    overflow: "hidden",
  },
  fill: {
    height: 4,
    borderRadius: 2,
  },
});
