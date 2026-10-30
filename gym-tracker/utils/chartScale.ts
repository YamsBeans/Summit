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
