/**
 * Cursor arithmetic for selection lists whose entries can be unavailable.
 *
 * Deliberately free of Phaser so the fiddly part — stepping over gaps, running
 * out of room, every entry disabled — is directly testable. {@link SelectorBar}
 * is the display side; this is the logic it drives.
 */

/** First enabled index scanning from `from` towards `step`, or null. */
export function firstEnabledIndex(
  disabled: readonly boolean[],
  from: number,
  step: number,
): number | null {
  for (let i = from; i >= 0 && i < disabled.length; i += step) {
    if (!disabled[i]) return i;
  }
  return null;
}

/** The enabled index closest to `from`, preferring forwards. Null if none. */
export function nearestEnabledIndex(disabled: readonly boolean[], from: number): number | null {
  if (disabled.length === 0) return null;
  if (!disabled[from]) return from;
  return firstEnabledIndex(disabled, from, 1) ?? firstEnabledIndex(disabled, from, -1);
}

/**
 * Land `delta` steps from `from`, stepping over disabled entries. Stops at the
 * edge rather than wrapping, and returns `from` unchanged when there is nothing
 * available in that direction.
 */
export function stepSelection(
  disabled: readonly boolean[],
  from: number,
  delta: number,
): number {
  if (disabled.length === 0 || delta === 0) return from;
  const step = delta > 0 ? 1 : -1;
  let index = from;

  for (let remaining = Math.abs(delta); remaining > 0; remaining -= 1) {
    let next = index + step;
    while (next >= 0 && next < disabled.length && disabled[next]) next += step;
    if (next < 0 || next >= disabled.length) break; // nothing available that way
    index = next;
  }

  return index;
}
