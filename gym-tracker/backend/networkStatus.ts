import NetInfo from "@react-native-community/netinfo";

// Use an object so imports always read the current value (object reference is stable)
export const networkStatus = {
  isConnected: true,
};

const update = (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => {
  networkStatus.isConnected = !!(state.isConnected && state.isInternetReachable !== false);
};

try {
  NetInfo.fetch().then(update).catch(() => {});
  NetInfo.addEventListener(update);
} catch {
  // NetInfo native module unavailable (Expo Go or dev build before rebuild) — default stays online
}