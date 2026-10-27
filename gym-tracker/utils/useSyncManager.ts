import { useEffect, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { db, isOnline } from "@/backend/db";

export function useSyncManager(userId: string | null) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedCount, setLastSyncedCount] = useState(0);
  const wasConnected = useRef<boolean | null>(null);

  useEffect(() => {
    if (!isOnline || !userId) return;

    // Sync any sessions queued from a previous app session
    (async () => {
      try {
        const pending = await db.getPendingSessionCount();
        if (pending === 0) return;
        const state = await NetInfo.fetch();
        if (state.isConnected && state.isInternetReachable !== false) {
          setIsSyncing(true);
          const { synced } = await db.syncPendingSessions(userId);
          if (synced > 0) setLastSyncedCount(synced);
          setIsSyncing(false);
        }
      } catch {
        // NetInfo unavailable — skip startup sync
      }
    })();

    // Sync whenever the network comes back
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = NetInfo.addEventListener(async (state) => {
        const connected = !!(state.isConnected && state.isInternetReachable !== false);
        if (connected && wasConnected.current === false) {
          setIsSyncing(true);
          const { synced } = await db.syncPendingSessions(userId);
          if (synced > 0) setLastSyncedCount(synced);
          setIsSyncing(false);
        }
        wasConnected.current = connected;
      });
    } catch {
      // NetInfo unavailable — reconnect sync disabled
    }

    return () => unsubscribe?.();
  }, [userId]);

  return { isSyncing, lastSyncedCount };
}
