import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeContext";

/**
 * Bottom sheet used for the workout logger's set, exercise and rest-timer
 * menus: grab handle, small caps title, content, and a Cancel button.
 * Taps inside the sheet don't fall through to the backdrop (which closes it),
 * and the bottom padding follows the safe area instead of a fixed 44px.
 */
export function ActionSheet({ visible, onClose, title, children }: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 12) + 20 }]}
          onPress={() => {}}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          {!!title && (
            <Text style={[styles.title, { color: colors.textSecondary }]} numberOfLines={1}>{title}</Text>
          )}
          {children}
          <Pressable
            style={[styles.cancelBtn, { backgroundColor: colors.surfaceSecondary }]}
            onPress={onClose}
            accessibilityRole="button"
          >
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type Tone = "primary" | "warning" | "danger";

/** One row in an ActionSheet: tinted icon, label, optional value, chevron. */
export function SheetOption({ icon, emoji, label, value, tone = "primary", onPress, last, children, style }: {
  icon?: keyof typeof Ionicons.glyphMap;
  /** Shown instead of an icon (e.g. 🔥 for warm-ups). */
  emoji?: string;
  label: string;
  value?: string;
  tone?: Tone;
  /** Without onPress the row is a plain container (for inline controls). */
  onPress?: () => void;
  last?: boolean;
  /** Extra controls on the right, in place of the chevron. */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const tint = tone === "danger" ? colors.danger : colors.primary;
  const bg = tone === "danger" ? colors.dangerLight : tone === "warning" ? colors.warningLight : colors.primaryLight;
  const body = (
    <>
      <View style={[styles.iconWrap, { backgroundColor: bg }]}>
        {emoji ? <Text style={{ fontSize: 16 }}>{emoji}</Text> : icon ? <Ionicons name={icon} size={16} color={tint} /> : null}
      </View>
      <Text style={[styles.label, { color: tone === "danger" ? colors.danger : colors.text }]}>{label}</Text>
      {value != null && <Text style={[styles.value, { color: colors.textSecondary }]}>{value}</Text>}
      {children ?? (onPress && (
        <Ionicons
          name="chevron-forward"
          size={16}
          color={tone === "danger" ? colors.danger : colors.textTertiary}
          style={tone === "danger" ? { opacity: 0.4 } : undefined}
        />
      ))}
    </>
  );
  const rowStyle = [styles.option, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }, style];
  return onPress ? (
    <Pressable style={rowStyle} onPress={onPress} accessibilityRole="button">{body}</Pressable>
  ) : (
    <View style={rowStyle}>{body}</View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: 16,
    alignItems: "center",
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  handle: { width: 36, height: 4, borderRadius: 2, marginBottom: 16 },
  title: { fontSize: 12, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 12, maxWidth: "100%" },
  option: { flexDirection: "row", alignItems: "center", width: "100%", paddingVertical: 14, gap: 14 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 16, fontWeight: "600", flex: 1 },
  value: { fontSize: 14, fontWeight: "600" },
  cancelBtn: { marginTop: 14, paddingVertical: 14, borderRadius: 12, width: "100%", alignItems: "center" },
  cancelText: { fontSize: 16, fontWeight: "600" },
});
