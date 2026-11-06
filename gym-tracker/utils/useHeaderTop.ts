import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Top padding for a screen's own header row: the status-bar / notch inset
 * plus a little breathing room. Screens used a fixed 56–60px. That's too
 * little under a Dynamic Island, too much on Android and wasted space on the
 * web.
 */
export function useHeaderTop(extra = 12): number {
  const { top } = useSafeAreaInsets();
  if (Platform.OS === "web") return Math.max(top, 16);
  return top + extra;
}
