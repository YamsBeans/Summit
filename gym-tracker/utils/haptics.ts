import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

/**
 * Fire-and-forget haptic feedback. No-ops on web and swallows errors so a
 * device without a haptic engine can never break a logging action.
 */
export function tapLight() {
  if (Platform.OS === "web") return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function notifySuccess() {
  if (Platform.OS === "web") return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
