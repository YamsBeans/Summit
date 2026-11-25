import NetInfo from "@react-native-community/netinfo";

// Use an object so imports always read the current value (object reference is stable)
export const networkStatus = {
  isConnected: true,
};

const listeners = new Set<(connected: boolean) => void>();

/** Be told when connectivity changes (for UI such as the Offline badge). */
export function subscribeNetworkStatus(fn: (connected: boolean) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

const update = (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => {
  const next = !!(state.isConnected && state.isInternetReachable !== false);
  if (next === networkStatus.isConnected) return;
  networkStatus.isConnected = next;
  listeners.forEach((fn) => fn(next));
};

try {
  NetInfo.fetch().then(update).catch(() => {});
  NetInfo.addEventListener(update);
} catch {
  // NetInfo native module unavailable (Expo Go or dev build before rebuild) — default stays online
}
