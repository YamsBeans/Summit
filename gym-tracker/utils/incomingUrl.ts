import { useEffect, useState } from "react";
import * as Linking from "expo-linking";

// Remembers the newest deep link the app was opened with.
//
// Linking.useURL() only hears 'url' events after the screen that calls it has
// mounted. When the app is already running and a link is tapped, expo-router
// mounts the target screen *because of* that event, so the screen's listener
// is too late: it sees nothing (stuck spinner) or the URL that cold-launched
// the app earlier (an old, used link). This module is imported by the root
// layout, so its listener is in place before any link arrives.

let latest: string | null = null;
const listeners = new Set<(url: string) => void>();
const consumed = new Set<string>();

function publish(url: string) {
  latest = url;
  listeners.forEach((fn) => fn(url));
}

let started = false;
export function startIncomingUrlTracking() {
  if (started) return;
  started = true;
  Linking.addEventListener("url", ({ url }) => publish(url));
  Linking.getInitialURL()
    .then((url) => {
      // A warm-start event that already arrived is newer than the launch URL.
      if (url && latest === null) publish(url);
    })
    .catch(() => {});
}

/** Mark a one-time link (e.g. a password reset) as used so a remount doesn't replay it. */
export function consumeIncomingUrl(url: string) {
  consumed.add(url);
}

/** True when the newest link has already been handled (opened a second time). */
export function latestIncomingUrlConsumed(): boolean {
  return latest !== null && consumed.has(latest);
}

/** The newest incoming URL that hasn't been consumed, updating as links arrive. */
export function useIncomingUrl(): string | null {
  startIncomingUrlTracking();
  const [url, setUrl] = useState<string | null>(() => latest);
  useEffect(() => {
    if (latest !== null) setUrl(latest);
    const fn = (u: string) => setUrl(u);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return url && !consumed.has(url) ? url : null;
}
