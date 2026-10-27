import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";
import { useTheme } from "@/theme/ThemeContext";

type Props = {
  visible: boolean;
  isUploading: boolean;
  onPhoto: (uri: string) => void;
  onSkip: () => void;
};

export default function ProgressPhotoModal({ visible, isUploading, onPhoto, onSkip }: Props) {
  const { colors } = useTheme();

  const handleCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow camera access to take a progress photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      onPhoto(result.assets[0].uri);
    }
  };

  const handleLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo library access to pick a progress photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      onPhoto(result.assets[0].uri);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onSkip}>
      <Pressable style={styles.overlay} onPress={isUploading ? undefined : onSkip}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface }]}
          onPress={() => {}}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={[styles.iconWrap, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="camera-outline" size={28} color={colors.primary} />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>Progress Photo</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Document your progress with a photo
          </Text>

          {isUploading ? (
            <View style={styles.uploadingWrap}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.uploadingText, { color: colors.textSecondary }]}>Uploading…</Text>
            </View>
          ) : (
            <>
              <Pressable
                style={[styles.option, { borderBottomColor: colors.border }]}
                onPress={handleCamera}
              >
                <View style={[styles.optionIcon, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name="camera-outline" size={18} color={colors.primary} />
                </View>
                <Text style={[styles.optionLabel, { color: colors.text }]}>Take Photo</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </Pressable>

              <Pressable
                style={[styles.option, { borderBottomColor: colors.border }]}
                onPress={handleLibrary}
              >
                <View style={[styles.optionIcon, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name="images-outline" size={18} color={colors.primary} />
                </View>
                <Text style={[styles.optionLabel, { color: colors.text }]}>Choose from Library</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </Pressable>

              <Pressable
                style={[styles.skipBtn, { backgroundColor: colors.surfaceSecondary }]}
                onPress={onSkip}
              >
                <Text style={[styles.skipText, { color: colors.textSecondary }]}>Skip</Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 44,
    paddingHorizontal: 16,
    alignItems: "center",
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  handle: { width: 36, height: 4, borderRadius: 2, marginBottom: 20 },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 4 },
  subtitle: { fontSize: 14, marginBottom: 24, textAlign: "center" },
  option: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingVertical: 14,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  optionLabel: { fontSize: 16, fontWeight: "600", flex: 1 },
  skipBtn: {
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },
  skipText: { fontSize: 16, fontWeight: "600" },
  uploadingWrap: { alignItems: "center", paddingVertical: 32, gap: 12 },
  uploadingText: { fontSize: 15, fontWeight: "500" },
});
