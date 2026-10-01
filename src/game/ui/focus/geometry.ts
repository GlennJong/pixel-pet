import { Bounds, Direction, Focusable, Point2D } from './types';

/** Off-axis penalty — heavily favours candidates aligned with the travel axis. */
const LAMBDA = 2.5;

/** Build a Bounds (with center) from a top-left rect. */
export function rectBounds(x: number, y: number, width: number, height: number): Bounds {
  return { x, y, width, height, center: { x: x + width / 2, y: y + height / 2 } };
}

/** Map a Phaser key code to a navigation Direction, or null. */
export function directionFromCode(code: string): Direction | null {
  switch (code) {
    case 'ArrowUp': return 'UP';
    case 'ArrowDown': return 'DOWN';
    case 'ArrowLeft': return 'LEFT';
    case 'ArrowRight': return 'RIGHT';
    default: return null;
  }
}

/**
 * Half-space + weighted distance score for a candidate relative to origin in a
 * direction. Returns null when the candidate is not in the direction's
 * half-space (so it's filtered out). Lower score = better.
 */
export function score(origin: Point2D, candidate: Point2D, dir: Direction): number | null {
  const dx = candidate.x - origin.x;
  const dy = candidate.y - origin.y;

  switch (dir) {
    case 'UP':    if (dy >= 0) return null; break;
    case 'DOWN':  if (dy <= 0) return null; break;
    case 'LEFT':  if (dx >= 0) return null; break;
    case 'RIGHT': if (dx <= 0) return null; break;
  }

  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  return dir === 'LEFT' || dir === 'RIGHT'
    ? adx + LAMBDA * ady
    : ady + LAMBDA * adx;
}

/**
 * Choose the best candidate among `members` (excluding `fromId`) travelling
 * `dir` from `origin`. Lowest score wins; ties break on smaller cross-axis
 * distance, then lexicographic id, for determinism in regular grids.
 */
export function pickBest(
  origin: Point2D,
  members: Focusable[],
  fromId: string | null,
  dir: Direction,
): Focusable | null {
  let best: Focusable | null = null;
  let bestScore = Infinity;
  let bestCross = Infinity;

  for (const m of members) {
    if (m.id === fromId) continue;
    const c = m.getBounds().center;
    const s = score(origin, c, dir);
    if (s === null) continue;

    const cross = dir === 'LEFT' || dir === 'RIGHT'
      ? Math.abs(c.y - origin.y)
      : Math.abs(c.x - origin.x);

    if (
      s < bestScore ||
      (s === bestScore && cross < bestCross) ||
      (s === bestScore && cross === bestCross && best !== null && m.id < best.id)
    ) {
      best = m;
      bestScore = s;
      bestCross = cross;
    }
  }

  return best;
}

/** The extreme-edge member along the vertical axis (top for 'first', bottom for 'last'). */
export function edgeMember(members: Focusable[], edge: 'first' | 'last'): Focusable | null {
  let best: Focusable | null = null;
  for (const m of members) {
    if (!best) { best = m; continue; }
    const my = m.getBounds().center.y;
    const by = best.getBounds().center.y;
    if (edge === 'first' ? my < by : my > by) best = m;
  }
  return best;
}
