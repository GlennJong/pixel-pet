import { describe, it, expect } from 'vitest';
import { firstEnabledIndex, nearestEnabledIndex, stepSelection } from './selection';

// NAV_BUTTONS with SPRITES unavailable: LIBRARY, [SPRITES], SAVE, EXIT
const SPRITES_OFF = [false, true, false, false];
const NONE_OFF = [false, false, false, false];

describe('stepSelection', () => {
  it('steps over a disabled neighbour instead of landing on it', () => {
    expect(stepSelection(SPRITES_OFF, 0, 1)).toBe(2);  // LIBRARY → SAVE
    expect(stepSelection(SPRITES_OFF, 2, -1)).toBe(0); // SAVE → LIBRARY
  });

  it('behaves normally when nothing is disabled', () => {
    expect(stepSelection(NONE_OFF, 0, 1)).toBe(1);
    expect(stepSelection(NONE_OFF, 3, -1)).toBe(2);
  });

  it('stops at the edge rather than wrapping', () => {
    expect(stepSelection(NONE_OFF, 3, 1)).toBe(3);
    expect(stepSelection(NONE_OFF, 0, -1)).toBe(0);
  });

  it('stays put when every item that way is disabled', () => {
    expect(stepSelection([false, true, true], 0, 1)).toBe(0);
  });

  it('crosses a run of disabled items', () => {
    expect(stepSelection([false, true, true, true, false], 0, 1)).toBe(4);
  });

  it('stays put when everything is disabled, or there is nothing', () => {
    expect(stepSelection([true, true], 0, 1)).toBe(0);
    expect(stepSelection([], 0, 1)).toBe(0);
  });

  it('honours a multi-step delta, counting only enabled landings', () => {
    expect(stepSelection([false, true, false, false], 0, 2)).toBe(3);
  });
});

describe('firstEnabledIndex / nearestEnabledIndex', () => {
  it('finds the first and last enabled entries', () => {
    expect(firstEnabledIndex(SPRITES_OFF, 0, 1)).toBe(0);
    expect(firstEnabledIndex(SPRITES_OFF, 3, -1)).toBe(3);
    expect(firstEnabledIndex([true, true, false], 0, 1)).toBe(2);
  });

  it('returns null when the scan finds nothing', () => {
    expect(firstEnabledIndex([true, true], 0, 1)).toBeNull();
    expect(firstEnabledIndex([], 0, 1)).toBeNull();
  });

  it('rescues a selection stranded on a newly disabled entry', () => {
    // The cursor sat on SPRITES (1); it just became unavailable.
    expect(nearestEnabledIndex(SPRITES_OFF, 1)).toBe(2);
  });

  it('falls back to searching backwards when nothing follows', () => {
    expect(nearestEnabledIndex([false, false, true], 2)).toBe(1);
  });

  it('leaves an already-enabled selection alone', () => {
    expect(nearestEnabledIndex(SPRITES_OFF, 3)).toBe(3);
  });

  it('gives up when every entry is disabled', () => {
    expect(nearestEnabledIndex([true, true], 0)).toBeNull();
  });
});
