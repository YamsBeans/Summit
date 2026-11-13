import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { db, isOnline } from "@/backend/db";

// While changes are still waiting after a sync (lie-fi, a 5xx), try again on
// a backoff instead of only on the next offline→online change, which may
// never come if NetInfo stayed "connected" the whole time.
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 5 * 60_000;

export function retryDelay(attempt: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(0, attempt), RETRY_MAX_MS);
}

export function useSyncManager(userId: string | null) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedCount, setLastSyncedCount] = useState(0);
  const wasConnected = useRef<boolean | null>(null);

  useEffect(() => {
    if (!isOnline || !userId) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const scheduleRetry = () => {
      if (cancelled || retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        attempt++;
        trySync(false);
      }, retryDelay(attempt));
    };

    // checkNetwork: ask NetInfo first (the startup/retry paths). The
    // reconnect listener already knows it's connected, and always syncs.
    async function trySync(checkNetwork: boolean) {
      try {
        if (checkNetwork || attempt > 0) {
          const pending = await db.getPendingSessionCount(userId!);
          if (cancelled || pending === 0) { attempt = 0; return; }
        }
        if (checkNetwork || attempt > 0) {
          const state = await NetInfo.fetch();
          if (!(state.isConnected && state.isInternetReachable !== false)) return; // the reconnect listener takes over
        }
        if (cancelled) return;
        setIsSyncing(true);
        try {
          const { synced } = await db.syncPendingSessions(userId!);
          if (!cancelled && synced > 0) setLastSyncedCount(synced);
        } catch {
          // Stays queued; retried below.
        } finally {
          // Without this, a failed sync left "Syncing…" up for good.
          if (!cancelled) setIsSyncing(false);
        }
        if ((await db.getPendingSessionCount(userId!)) > 0) scheduleRetry();
        else attempt = 0;
      } catch {
        // NetInfo unavailable — skip this attempt
      }
    }

    (async () => {
      // Changes this account queued before it last signed out on this device.
      await db.restoreParkedChanges(userId).catch(() => 0);
      // Sync any sessions queued from a previous app session
      await trySync(true);
    })();

    // Sync whenever the network comes back
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = NetInfo.addEventListener((state) => {
        const connected = !!(state.isConnected && state.isInternetReachable !== false);
        if (connected && wasConnected.current === false) {
          attempt = 0;
          if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
          trySync(false);
        }
        wasConnected.current = connected;
      });
    } catch {
      // NetInfo unavailable — reconnect sync disabled
    }

    // And when the app comes back to the foreground.
    let appSub: { remove: () => void } | undefined;
    try {
      appSub = AppState.addEventListener("change", (s) => {
        if (s === "active" && !retryTimer) trySync(true);
      });
    } catch {
      // AppState unavailable (tests)
    }

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      unsubscribe?.();
      appSub?.remove();
    };
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
