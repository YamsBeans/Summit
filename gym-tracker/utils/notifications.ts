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

// Every start/adjust/skip bumps the generation; a schedule that finishes
// after a newer call (two quick +30s taps, or Skip while the settings read
// was pending) is dropped instead of firing early. Calls run one at a time.
let generation = 0;
let chain: Promise<unknown> = Promise.resolve();
const serial = (job: () => Promise<void>) => {
  const run = chain.then(job, job);
  chain = run.catch(() => {});
  return run;
};

/** Claim the next rest notification; pass the token to schedule it later. */
export function beginRestNotification(): number {
  return ++generation;
}

export function scheduleRestDoneNotification(seconds: number, token: number = beginRestNotification()): Promise<void> {
  return serial(async () => {
    if (token !== generation) return;
    await cancelScheduled();
    if (!(seconds >= 1)) return;
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Rest complete",
        body: "Time to lift! Your rest period is over.",
        sound: "default",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.round(seconds),
        // Use the high-importance channel created in requestNotificationPermissions
        // so the alert actually pops up on Android instead of landing silently.
        ...(Platform.OS === "android" ? { channelId: "rest-timer" } : {}),
      },
    });
    if (token !== generation) {
      // Superseded while scheduling.
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
      return;
    }
    scheduledNotifId = id;
  });
}

async function cancelScheduled() {
  if (scheduledNotifId) {
    const id = scheduledNotifId;
    scheduledNotifId = null;
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  }
}

export function cancelRestDoneNotification(): Promise<void> {
  generation++;
  return serial(cancelScheduled);
}
