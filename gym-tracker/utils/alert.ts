import { Alert, AlertButton, Platform } from "react-native";

/**
 * Drop-in replacement for Alert.alert that also works on web.
 *
 * react-native-web's Alert.alert is a no-op, so on web we fall back to the
 * browser's own dialogs:
 *  - no buttons / one button  -> window.alert, then that button's onPress
 *  - a cancel + action button -> window.confirm; OK runs the action button
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== "web") {
    Alert.alert(title, message, buttons);
    return;
  }

  if (typeof window === "undefined") return;

  const text = message ? `${title}\n\n${message}` : title;
  const list = buttons ?? [];
  const actions = list.filter((b) => b.style !== "cancel");
  const cancel = list.find((b) => b.style === "cancel");

  if (list.length <= 1) {
    window.alert(text);
    list[0]?.onPress?.();
    return;
  }

  // Pick the main action: a destructive button if there is one, otherwise the last action.
  const primary = actions.find((b) => b.style === "destructive") ?? actions[actions.length - 1];

  if (window.confirm(text)) {
    primary?.onPress?.();
  } else {
    cancel?.onPress?.();
  }
}
