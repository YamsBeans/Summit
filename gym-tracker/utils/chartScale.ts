/**
 * Round the axis max up to a value that splits into `sections` whole-number
 * steps (1, 2, 5 × 10ⁿ), so labels read 0/25/50/75/100 rather than 0.3/0.8.
 */
export function niceAxisMax(maxValue: number, sections = 4): number {
  if (!(maxValue > 0)) return sections;
  const rawStep = maxValue / sections;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= rawStep && Number.isInteger(st)) ?? Math.ceil(rawStep);
  return Math.max(1, step) * sections;
}

const niceStep = (raw: number): number => {
  if (!(raw > 0)) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= raw && Number.isInteger(st)) ?? Math.ceil(raw);
};

/**
 * Y-axis for a progress chart: a tidy start (offset), span and step. When
 * the values sit in a narrow band far from zero (squats 185 → 205), the axis
 * starts near them instead of at 0, so progress is visible rather than a
 * flat line across the top of a 0–400 chart. Wide-ranging values keep 0.
 */
export function niceAxisRange(values: number[], sections = 4): { offset: number; span: number } {
  const vals = values.filter((v) => Number.isFinite(v));
  if (vals.length === 0) return { offset: 0, span: sections };
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (min <= 0 || max - min > max * 0.5) {
    return { offset: 0, span: niceAxisMax(max * 1.1, sections) };
  }
  const pad = Math.max((max - min) * 0.25, max * 0.05);
  const lo = Math.max(0, min - pad);
  const hi = max + pad;
  let step = niceStep((hi - lo) / sections);
  let offset = Math.floor(lo / step) * step;
  // Starting lower can leave the top short; widen until it fits.
  while (offset + step * sections < hi) {
    step = niceStep(step * 1.001); // next tidy step up
    offset = Math.floor(lo / step) * step;
  }
  return { offset, span: step * sections };
}
