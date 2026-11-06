import { useEffect, useState } from "react";
import { isOnline } from "@/backend/db";
import { networkStatus, subscribeNetworkStatus } from "@/backend/networkStatus";

/**
 * - "local": no server is configured; everything lives on this device.
 * - "offline": signed-in build with no connection right now.
 * - "online": connected to the server.
 *
 * The old badge used the build-time `isOnline` flag, so it said "Offline"
 * in local-only builds and stayed hidden when a signed-in user lost signal.
 */
export type ConnectionMode = "local" | "offline" | "online";

export function useConnectionMode(): ConnectionMode {
  const [connected, setConnected] = useState(networkStatus.isConnected);
  useEffect(() => {
    setConnected(networkStatus.isConnected);
    return subscribeNetworkStatus(setConnected);
  }, []);
  if (!isOnline) return "local";
  return connected ? "online" : "offline";
}
