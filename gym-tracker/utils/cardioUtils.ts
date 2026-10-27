export type ExerciseType = 'strength' | 'cardio' | 'stretching';

// ─── Duration digit-shift helpers ────────────────────────────────────────────
// Stores up to 6 raw digits. Each new digit appends to the right and shifts
// older digits left, filling seconds → minutes → hours.
// e.g. typing 1,3,0,0,0 → buffer "13000" → displays "1:30:00"

/** Convert a stored seconds value back to the raw digit string (for pre-fill). */
export function secondsToDigits(secs: number | null | undefined): string {
  if (!secs || secs <= 0) return "";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}${String(m).padStart(2, "0")}${String(s).padStart(2, "0")}`;
  if (m > 0) return `${m}${String(s).padStart(2, "0")}`;
  return String(s);
}

/** Format a raw digit buffer (up to 6 chars) into a human-readable h:mm:ss / m:ss string. */
export function formatDigits(digits: string): string {
  if (!digits) return "";
  const padded = digits.padStart(6, "0");
  const h = parseInt(padded.slice(0, 2), 10);
  const m = parseInt(padded.slice(2, 4), 10);
  const s = parseInt(padded.slice(4, 6), 10);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Convert a raw digit buffer back to a total-seconds integer. */
export function digitsToSeconds(digits: string): number {
  if (!digits) return 0;
  const padded = digits.padStart(6, "0");
  const h = parseInt(padded.slice(0, 2), 10);
  const m = parseInt(padded.slice(2, 4), 10);
  const s = parseInt(padded.slice(4, 6), 10);
  return h * 3600 + m * 60 + s;
}

// ─── Duration ───────────────────────────────────────────────────────────────

/**
 * Parse "mm:ss" or "h:mm:ss" → total seconds. Returns null if unparseable.
 */
export function parseDuration(str: string): number | null {
  const trimmed = str.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 2) {
    const [m, s] = parts;
    return m * 60 + s;
  }
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return h * 3600 + m * 60 + s;
  }
  // Plain seconds number
  const n = Number(trimmed);
  return isNaN(n) ? null : n;
}

/**
 * Total seconds → "mm:ss" (or "h:mm:ss" for >= 1 hour).
 */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  if (h > 0) {
    return `${h}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

/**
 * Seconds → "Xh Ym" short label for display in stats/history (e.g. "1h 32m").
 */
export function formatDurationShort(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ─── Distance ────────────────────────────────────────────────────────────────

export function metersToKm(m: number): number {
  return m / 1000;
}

export function metersToMiles(m: number): number {
  return m / 1609.344;
}

export function kmToMeters(km: number): number {
  return km * 1000;
}

export function milesToMeters(mi: number): number {
  return mi * 1609.344;
}

/**
 * Format meters into a display string with the given unit.
 * e.g. formatDistance(5000, 'km') → "5.00 km"
 */
export function formatDistance(meters: number, unit: 'km' | 'mi'): string {
  if (unit === 'mi') {
    return `${metersToMiles(meters).toFixed(2)} mi`;
  }
  return `${metersToKm(meters).toFixed(2)} km`;
}

/**
 * Parse a distance string entered by the user (e.g. "5.2") and convert it
 * to meters based on the active unit.
 */
export function parseDistanceToMeters(str: string, unit: 'km' | 'mi'): number | null {
  const val = parseFloat(str);
  if (isNaN(val)) return null;
  return unit === 'mi' ? milesToMeters(val) : kmToMeters(val);
}

/**
 * Convert meters to the display unit as a plain number (for TextInput pre-fill).
 */
export function metersToDisplay(meters: number, unit: 'km' | 'mi'): number {
  return unit === 'mi' ? metersToMiles(meters) : metersToKm(meters);
}

// ─── Pace / Speed ─────────────────────────────────────────────────────────────

/**
 * Compute pace in seconds per km.
 */
export function computePace(distanceMeters: number, durationSeconds: number): number {
  if (distanceMeters <= 0) return 0;
  return durationSeconds / (distanceMeters / 1000);
}

/**
 * Format seconds-per-km → "m:ss /km"
 */
export function formatPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')} /km`;
}

/**
 * Compute speed in km/h.
 */
export function computeSpeed(distanceMeters: number, durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  return (distanceMeters / 1000) / (durationSeconds / 3600);
}

// ─── Session aggregation ─────────────────────────────────────────────────────

export type CardioSetLike = {
  duration_seconds?: number | null;
  distance_meters?: number | null;
  pace_sec_per_km?: number | null;
  completed?: boolean;
};

export type CardioSummary = {
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  bestPaceSecPerKm: number | null;
  bestDistanceMeters: number;
};

/**
 * Aggregate cardio metrics across an array of sets (only completed sets count
 * toward totals; bestDistance considers all completed sets).
 */
export function computeCardioSummary(sets: CardioSetLike[]): CardioSummary {
  let totalDistanceMeters = 0;
  let totalDurationSeconds = 0;
  let bestPaceSecPerKm: number | null = null;
  let bestDistanceMeters = 0;

  for (const set of sets) {
    const isCardioSet =
      (set.duration_seconds != null && set.duration_seconds > 0) ||
      (set.distance_meters != null && set.distance_meters > 0);
    if (!isCardioSet) continue;
    if (set.completed === false) continue;

    const dist = set.distance_meters ?? 0;
    const dur = set.duration_seconds ?? 0;
    totalDistanceMeters += dist;
    totalDurationSeconds += dur;
    if (dist > bestDistanceMeters) bestDistanceMeters = dist;

    // Best pace = lowest sec/km (fastest)
    const pace = set.pace_sec_per_km ?? (dist > 0 && dur > 0 ? computePace(dist, dur) : null);
    if (pace != null && pace > 0) {
      if (bestPaceSecPerKm === null || pace < bestPaceSecPerKm) {
        bestPaceSecPerKm = pace;
      }
    }
  }

  return { totalDistanceMeters, totalDurationSeconds, bestPaceSecPerKm, bestDistanceMeters };
}
