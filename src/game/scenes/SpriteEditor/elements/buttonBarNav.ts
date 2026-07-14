import { ButtonBar } from './ButtonBar';

export interface ButtonBarKeyHandlers {
  /** ArrowUp — move focus out of the bar (upward). */
  onExitUp?: () => void;
  /** Escape — cancel / leave the bar. */
  onEscape?: () => void;
}

/**
 * Handle the button-bar cursor keys shared by every editor screen:
 * Left/Right move the cursor, Space executes. ArrowUp/Escape delegate to the
 * per-screen callbacks, which own the (screen-specific) focus transition out
 * of the bar. Returns true if the key was consumed.
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
    case 'Escape':     handlers.onEscape?.(); return true;
  }
  return false;
}
