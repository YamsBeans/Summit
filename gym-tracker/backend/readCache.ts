import AsyncStorage from "@react-native-async-storage/async-storage";

// Read-through cache for Supabase reads.
//
// Successful online reads are mirrored to AsyncStorage; when the device is
// offline, the last mirrored result is replayed so the app still shows the
// user's routines/history/PRs on a cold start (closes DEF-06). Because online
// reads always refetch and overwrite, the cache is only ever *served* offline —
// so there is no invalidation logic to keep in sync.

const PREFIX = "@gym_tracker_cache:";

export type DbReadResult = { data: any; error: any };

/** Mirror a successful server read into AsyncStorage. Best-effort; never throws. */
export async function writeCache(key: string, data: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(data));
  } catch {
    // Caching is best-effort; a failure here must not break the read.
  }
}

/** Read a previously-cached server response, or null if absent/corrupt. */
export async function readCache<T = any>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Remove every cached read. Call on sign-out so users never see each other's data. */
export async function clearReadCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith(PREFIX));
    if (ours.length > 0) await AsyncStorage.multiRemove(ours);
  } catch {
    // ignore
  }
}

/**
 * True for errors that mean "couldn't reach the server" rather than "the
 * server said no": fetch failures, timeouts, aborted requests.
 */
export function isNetworkError(err: any): boolean {
  if (!err) return false;
  if (err instanceof TypeError) return true;
  const text = `${err.name ?? ""} ${err.message ?? ""} ${err.details ?? ""}`;
  return /network request failed|failed to fetch|fetch failed|networkerror|load failed|network error|timed? ?out|aborterror|ECONNREFUSED|ENOTFOUND|ERR_INTERNET_DISCONNECTED/i.test(text);
}

/**
 * Read-through cache wrapper.
 * - Online: run the query, mirror a successful result, return it. If the
 *   request can't reach the server (gym basement "lie-fi", or a cold start
 *   before NetInfo has reported offline), serve the cached copy instead of
 *   an error screen.
 * - Offline: replay the cached result if present; otherwise fall back to the
 *   in-memory local store.
 */
export async function cachedRead(
  online: boolean,
  cacheKey: string,
  onlineFn: () => PromiseLike<DbReadResult>,
  offlineFn: () => PromiseLike<DbReadResult>,
): Promise<DbReadResult> {
  if (online) {
    let res: DbReadResult;
    try {
      res = await onlineFn();
    } catch (e) {
      res = { data: null, error: e };
    }
    if (!res.error && res.data != null) {
      await writeCache(cacheKey, res.data);
      return res;
    }
    if (isNetworkError(res.error)) {
      const cached = await readCache(cacheKey);
      if (cached != null) return { data: cached, error: null };
    }
    return res;
  }
  const cached = await readCache(cacheKey);
  if (cached != null) return { data: cached, error: null };
  return offlineFn();
}
