/**
 * Helpers for the numeric text fields used while logging sets.
 *
 * Text inputs hand us raw strings; these make sure we never persist NaN
 * (e.g. when the user types just "." or "-") and accept a comma decimal
 * separator, which many non-US keyboards produce on the decimal pad.
 */

/** Parse a weight-like field. Returns null for empty/invalid/negative input. */
export function parseDecimalInput(text: string | null | undefined): number | null {
  if (text == null) return null;
  const cleaned = text.trim().replace(",", ".");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** Parse a reps-like field. Returns null for empty/invalid/negative input. */
export function parseIntInput(text: string | null | undefined): number | null {
  const n = parseDecimalInput(text);
  if (n == null) return null;
  return Math.round(n);
}

/** Format a number for display in an input; null → "". Drops trailing ".0". */
export function formatNumberInput(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return String(Math.round(n * 100) / 100);
}
