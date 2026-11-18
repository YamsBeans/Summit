import { useRef, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text } from "react-native";
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import Reanimated, { useAnimatedStyle, interpolate, Extrapolation, type SharedValue } from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/theme/ThemeContext";

const ACTION_WIDTH = 84;

// On desktop web a mouse drag that starts on a button still clicks it when
// released (ticking the set), so swipe is for touch screens only there;
// the set menu's Remove Set covers mouse users.
const SWIPE_SUPPORTED =
  Platform.OS !== "web" ||
  (typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches);

/**
 * Swipe a row left to reveal a red Delete button, like Strong's and Hevy's
 * set rows. Deleting takes the tap too, so a stray swipe can't lose a set.
 * The row gets the card's surface colour so its tinted states (done,
 * warm-up) look the same while it slides.
 */
export function SwipeToDelete({ children, onDelete, label = "Delete", enabled = true }: {
  children: ReactNode;
  onDelete: () => void;
  label?: string;
  enabled?: boolean;
}) {
  const { colors } = useTheme();
  const ref = useRef<SwipeableMethods>(null);
  const fired = useRef(false);

  const fire = () => {
    if (fired.current) return;
    fired.current = true;
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    ref.current?.close();
    onDelete();
  };

  return (
    <ReanimatedSwipeable
      ref={ref}
      enabled={enabled && SWIPE_SUPPORTED}
      friction={1.5}
      rightThreshold={ACTION_WIDTH / 2}
      overshootRight={false}
      dragOffsetFromRightEdge={12}
      childrenContainerStyle={{ backgroundColor: colors.surface }}
      onSwipeableWillClose={() => { fired.current = false; }}
      renderRightActions={(_progress, translation) => (
        <DeleteAction translation={translation} label={label} color={colors.danger} onPress={fire} />
      )}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

function DeleteAction({ translation, label, color, onPress }: {
  translation: SharedValue<number>;
  label: string;
  color: string;
  onPress: () => void;
}) {
  // The label slides in with the row and fades as it does.
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(-translation.value, [0, ACTION_WIDTH * 0.6], [0, 1], Extrapolation.CLAMP),
  }));
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.action, { backgroundColor: color }]}
    >
      <Reanimated.View style={[styles.inner, style]}>
        <Ionicons name="trash-outline" size={18} color="#fff" />
        <Text style={styles.text}>Delete</Text>
      </Reanimated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: { width: ACTION_WIDTH, alignItems: "center", justifyContent: "center" },
  inner: { alignItems: "center", gap: 2 },
  text: { color: "#fff", fontSize: 12, fontWeight: "700" },
});
