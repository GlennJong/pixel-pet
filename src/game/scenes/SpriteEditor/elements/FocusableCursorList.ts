import Phaser from 'phaser';
import { Direction, Focusable, makeFocusable } from '@/game/ui/focus';

/**
 * Where a widget puts its internal cursor when it gains focus.
 *   'edge'  – at the edge it was entered from (enter travelling DOWN → first
 *             item, travelling UP → last). The natural choice for a vertical
 *             list or a grid.
 *   'first' – always the first item, whichever way it was entered. The natural
 *             choice for a horizontal bar, where a vertical entry carries no
 *             meaningful edge.
 *   'none'  – leave the cursor where it was.
 */
export type CursorHoming = 'edge' | 'first' | 'none';

export interface AsFocusableOptions {
  /** Availability gate (hidden / contextually unavailable → false). */
  isEnabled?: () => boolean;
  /** Cursor placement on entry (default 'edge'). */
  homeOnEnter?: CursorHoming;
  /** Space / Enter behaviour (default: activate the cursor's item). */
  onSelect?: () => void;
  /** Extra work after the widget takes focus. */
  onFocus?: (from?: Direction) => void;
  /** Extra work before the widget releases focus. */
  onBlur?: () => void;
  /** Raw-key capture; return true to consume. */
  handleKey?: (code: string) => boolean;
  /**
   * Directional override, consulted before the widget's own cursor movement.
   * Return true/false to decide the key, or undefined to fall through to the
   * default (move the cursor; false at the edge so the router bridges out).
   */
  handleDirection?: (dir: Direction) => boolean | undefined;
}

/**
 * Shared focus scaffolding for the keyboard-driven cursor lists (ButtonBar,
 * OptionMenu, GridSelector). Holds the focus flag, the activate/deactivate
 * entry points, and — via {@link asFocusable} — the widget's own description of
 * how arrow keys drive it.
 *
 * That last part is the point: screens used to hand-write the same adapter
 * (left/right move, up/down return false at the edge, Space activates) for every
 * widget on every screen, which is how the same bridge ended up implemented
 * three different ways. A widget now states its contract once, here.
 */
export abstract class FocusableCursorList extends Phaser.GameObjects.Container {
  protected _hasFocus = false;

  get hasFocus() { return this._hasFocus; }

  activate() {
    this._hasFocus = true;
    this.onFocusChange();
  }

  deactivate() {
    this._hasFocus = false;
    this.onFocusChange();
  }

  /** Re-render after the focus flag changes. */
  protected abstract onFocusChange(): void;

  /**
   * Move the internal cursor one step. Return false when the cursor is already
   * at this widget's edge in that direction, so the router moves focus out
   * instead (either geometrically or via the scope's boundaryOverride).
   */
  protected abstract moveCursorIn(dir: Direction): boolean;

  /** Put the cursor on the first / last item. */
  protected abstract homeCursor(edge: 'first' | 'last'): void;

  /** Activate whatever the cursor is on. */
  protected abstract activateCursor(): void;

  /** Describe this widget to the {@link FocusRouter} as one navigable item. */
  asFocusable(id: string, opts: AsFocusableOptions = {}): Focusable {
    const homing = opts.homeOnEnter ?? 'edge';

    return makeFocusable({
      id,
      object: this,
      isEnabled: opts.isEnabled,
      onFocus: (from) => {
        this.activate();
        if (homing === 'first') this.homeCursor('first');
        else if (homing === 'edge' && from === 'DOWN') this.homeCursor('first');
        else if (homing === 'edge' && from === 'UP') this.homeCursor('last');
        opts.onFocus?.(from);
      },
      onBlur: () => {
        opts.onBlur?.();
        this.deactivate();
      },
      onSelect: opts.onSelect ?? (() => this.activateCursor()),
      handleKey: opts.handleKey,
      handleDirection: (dir) => {
        const override = opts.handleDirection?.(dir);
        return override !== undefined ? override : this.moveCursorIn(dir);
      },
    });
  }
}
