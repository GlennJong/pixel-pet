import { ButtonBar } from './ButtonBar';

export interface ButtonBarKeyHandlers {
  /** ArrowUp — move focus out of the bar (upward). */
  onExitUp?: () => void;
  /** ArrowDown — move focus out of the bar (downward, e.g. wrap to the top). */
  onExitDown?: () => void;
  /** Escape — cancel / leave the bar. */
  onEscape?: () => void;
}

/**
 * Handle the button-bar cursor keys shared by every editor screen:
 * Left/Right move the cursor, Space executes. ArrowUp/ArrowDown/Escape delegate
 * to the per-screen callbacks, which own the (screen-specific) focus transition
 * out of the bar. Returns true if the key was consumed.
 *
 * ArrowDown is only consumed when an `onExitDown` handler is supplied, so bars
 * without a downward target keep their previous (no-op) behaviour.
 */
export function handleButtonBarKey(
  bar: ButtonBar,
  code: string,
  handlers: ButtonBarKeyHandlers = {},
): boolean {
  switch (code) {
    case 'ArrowLeft':  bar.moveCursor(-1);   return true;
    case 'ArrowRight': bar.moveCursor(1);    return true;
    case 'Space':      bar.executeCursor();  return true;
    case 'ArrowUp':    handlers.onExitUp?.(); return true;
    case 'ArrowDown':
      if (!handlers.onExitDown) return false;
      handlers.onExitDown();
      return true;
    case 'Escape':     handlers.onEscape?.(); return true;
  }
  return false;
}
