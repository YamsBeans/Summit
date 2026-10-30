import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@/theme/ThemeContext";

// ─── Reusable primitives ──────────────────────────────────────────────────────

export type SettingItemProps = {
  icon: string;
  label: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  destructive?: boolean;
  value?: string;
};

export function SettingItem({ icon, label, onPress, rightElement, destructive, value }: SettingItemProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      style={({ pressed }) => [
        {
          flexDirection: "row" as const, alignItems: "center" as const,
          paddingVertical: 13, paddingHorizontal: 16,
          borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
        },
        pressed && onPress && { backgroundColor: colors.surfaceSecondary },
      ]}
      onPress={onPress}
      disabled={!onPress && !rightElement}
    >
      <View style={{ width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: destructive ? colors.dangerLight : colors.surfaceSecondary, marginRight: 12 }}>
        <Ionicons name={icon as any} size={18} color={destructive ? colors.danger : colors.textSecondary} />
      </View>
      <Text style={[{ flex: 1, fontSize: 16, fontWeight: "500", color: colors.text }, destructive && { color: colors.danger }]}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {value && <Text style={{ fontSize: 14, color: colors.textSecondary }}>{value}</Text>}
        {rightElement ?? (onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} /> : null)}
      </View>
    </Pressable>
  );
}

export function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: 28, paddingHorizontal: 16 }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textSecondary, marginBottom: 8, marginLeft: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {title}
      </Text>
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, overflow: "hidden" }}>
        {children}
      </View>
    </View>
  );
}

export function ModalShell({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 }} onPress={onClose}>
          <Pressable
            style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 24, width: "100%", maxWidth: 340, elevation: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12 }}
            onPress={() => {}}
          >
            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text, textAlign: "center", marginBottom: 20 }}>{title}</Text>
            {children}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
