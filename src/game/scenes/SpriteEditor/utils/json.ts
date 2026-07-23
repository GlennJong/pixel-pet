/** Narrow an unknown value to a plain object (non-null, non-array, typeof 'object'). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Coerce a value to an integer, returning `fallback` when it isn't finite. */
export function toInteger(value: unknown, fallback: number): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.trunc(numberValue);
}
