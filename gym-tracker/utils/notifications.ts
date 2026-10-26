import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";

// Notification shown when received in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const REST_NOTIF_ID_KEY = "_restTimerNotifId";
let scheduledNotifId: string | null = null;

export async function requestNotificationPermissions(): Promise<boolean> {
  if (!Device.isDevice) return false;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("rest-timer", {
      name: "Rest Timer",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function scheduleRestDoneNotification(seconds: number): Promise<void> {
  // Cancel any previous rest timer notification
  await cancelRestDoneNotification();

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Rest complete",
      body: "Time to lift! Your rest period is over.",
      sound: "default",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
    },
  });

  scheduledNotifId = id;
}

export async function cancelRestDoneNotification(): Promise<void> {
  if (scheduledNotifId) {
    await Notifications.cancelScheduledNotificationAsync(scheduledNotifId).catch(() => {});
    scheduledNotifId = null;
  }
}