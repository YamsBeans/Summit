import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@/theme/ThemeContext";

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmStyle?: "danger" | "primary";
  icon?: keyof typeof Ionicons.glyphMap;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmModal({
  visible,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  confirmStyle = "danger",
  icon,
  onConfirm,
  onCancel,
}: Props) {
  const { colors } = useTheme();

  const confirmColor = confirmStyle === "danger" ? colors.danger : colors.primary;
  const confirmBg = confirmStyle === "danger" ? colors.dangerLight : colors.primaryLight;
  const iconColor = confirmStyle === "danger" ? colors.danger : colors.primary;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => {}} // prevent backdrop tap propagating through card
        >
          {icon && (
            <View style={[styles.iconWrap, { backgroundColor: confirmBg }]}>
              <Ionicons name={icon} size={26} color={iconColor} />
            </View>
          )}

          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>

          <View style={styles.buttons}>
            <Pressable
              style={[styles.btn, styles.cancelBtn, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
              onPress={onCancel}
            >
              <Text style={[styles.btnText, { color: colors.text }]}>{cancelText}</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.confirmBtn, { backgroundColor: confirmColor }]}
              onPress={onConfirm}
            >
              <Text style={[styles.btnText, styles.confirmBtnText]}>{confirmText}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  card: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 16,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  buttons: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  btn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelBtn: {
    borderWidth: 1,
  },
  confirmBtn: {},
  btnText: {
    fontSize: 15,
    fontWeight: "600",
  },
  confirmBtnText: {
    color: "#ffffff",
  },
});
