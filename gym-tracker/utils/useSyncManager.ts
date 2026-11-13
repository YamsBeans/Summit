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
        // Changes this account queued before it last signed out on this device.
        await db.restoreParkedChanges(userId).catch(() => 0);
        const pending = await db.getPendingSessionCount();
        if (pending === 0) return;
        const state = await NetInfo.fetch();
        if (state.isConnected && state.isInternetReachable !== false) {
          setIsSyncing(true);
          try {
            const { synced } = await db.syncPendingSessions(userId);
            if (synced > 0) setLastSyncedCount(synced);
          } finally {
            setIsSyncing(false);
          }
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
          try {
            const { synced } = await db.syncPendingSessions(userId);
            if (synced > 0) setLastSyncedCount(synced);
          } catch {
            // Stays queued; the next reconnect tries again.
          } finally {
            // Without this, a failed sync left "Syncing…" up for good.
            setIsSyncing(false);
          }
        }
        wasConnected.current = connected;
      });
    } catch {
      // NetInfo unavailable — reconnect sync disabled
    }

    return () => unsubscribe?.();
  }, [userId]);

  // "N workouts synced!" is a confirmation, not a status: it used to stay
  // pinned above every screen for the rest of the session.
  useEffect(() => {
    if (lastSyncedCount === 0) return;
    const t = setTimeout(() => setLastSyncedCount(0), 4000);
    return () => clearTimeout(t);
  }, [lastSyncedCount]);

  return { isSyncing, lastSyncedCount };
}
