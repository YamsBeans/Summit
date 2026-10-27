/**
 * Lightweight error logging for non-fatal failures we intentionally swallow
 * (background syncs, optional uploads, cache reads, etc.).
 *
 * Logs only in development (`__DEV__`), so production builds stay quiet while
 * developers still get a trace instead of an empty `catch {}`. This is the
 * single place to later forward errors to a telemetry sink (e.g. Sentry).
 */
export function logError(context: string, error: unknown): void {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn(`[${context}]`, error);
  }
}
