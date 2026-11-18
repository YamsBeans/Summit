// Workout durations from the stored session_date + start_time/end_time.
// Times are usually local "HH:MM:SS" strings; some older rows hold full ISO
// timestamps. A plain time that ends "before" it started means the workout
// ran past midnight, so it wraps by a day.

const DAY_MS = 24 * 60 * 60 * 1000;

function isTimestamp(t: string): boolean {
  return t.includes("T") || t.length > 10;
}

export function sessionDurationMs(
  sessionDate: string,
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): number | null {
  if (!startTime || !endTime) return null;
  const toDate = (t: string) => (isTimestamp(t) ? new Date(t) : new Date(`${sessionDate}T${t}`));
  const start = toDate(startTime);
  const end = toDate(endTime);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  let ms = end.getTime() - start.getTime();
  if (ms < 0 && !isTimestamp(endTime)) ms += DAY_MS;
  if (ms < 0) return null;
  return ms;
}

export function sessionDurationMins(
  sessionDate: string,
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): number | null {
  const ms = sessionDurationMs(sessionDate, startTime, endTime);
  return ms === null ? null : Math.floor(ms / 60000);
}
