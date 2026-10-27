import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeContext";

type Props = {
  remaining: number;
  onSkip: () => void;
  onAddTime: (secs: number) => void;
};

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function RestTimerBanner({ remaining, onSkip, onAddTime }: Props) {
  const { colors } = useTheme();
  if (remaining <= 0) return null;

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <View style={[styles.card, { backgroundColor: colors.surface, shadowColor: "#000" }]}>
        {/* Label */}
        <Text style={[styles.label, { color: colors.textTertiary }]}>Rest</Text>

        {/* Timer */}
        <Text style={[styles.timer, { color: colors.text }]}>{fmt(remaining)}</Text>

        {/* Buttons */}
        <View style={styles.btnRow}>
          <Pressable
            onPress={() => onAddTime(30)}
            style={[styles.btn, { backgroundColor: colors.surfaceSecondary }]}
          >
            <Text style={[styles.btnText, { color: colors.primary }]}>+30s</Text>
          </Pressable>
          <Pressable
            onPress={onSkip}
            style={[styles.btn, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.btnText, { color: "#fff" }]}>Skip</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    bottom: 24,
    left: 16,
    right: 16,
    alignItems: "center",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 8,
    width: "100%",
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    width: 32,
  },
  timer: {
    fontSize: 22,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    flex: 1,
    textAlign: "center",
  },
  btnRow: {
    flexDirection: "row",
    gap: 8,
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  btnText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
