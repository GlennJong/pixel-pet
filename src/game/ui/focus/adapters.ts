import Phaser from 'phaser';
import { Bounds, Direction, Focusable, FocusScope, ScopeState } from './types';

/** Anything that can report world-space bounds (Phaser Containers/GameObjects do). */
interface HasBounds {
  getBounds(): Phaser.Geom.Rectangle;
}

export interface FocusableConfig {
  id: string;
  /** The GameObject whose world bounds position this focusable for routing. */
  object: HasBounds;
  /**
   * Bounds to route by, when the object's own are not what the user sees.
   * A scrolling list reports the size of its *content*, so a long one reaches
   * far below its viewport and its centre can end up past its neighbours —
   * which silently removes it from spatial navigation.
   */
  bounds?: () => Phaser.Geom.Rectangle;
  isEnabled?: () => boolean;
  onFocus: (from?: Direction) => void;
  onBlur: () => void;
  onSelect?: () => void;
  /** Edit-mode raw-key capture (typing). Return true to consume. */
  handleKey?: (code: string) => boolean;
  /**
   * Internal directional nav / edit-mode capture. Return true to consume (moved
   * within the widget, or adjusted a value); false to let the router route the
   * direction spatially / to a boundary.
   */
  handleDirection?: (dir: Direction) => boolean;
}

/** Wrap an existing element (or sub-part) as a Focusable for the router. */
export function makeFocusable(cfg: FocusableConfig): Focusable {
  return {
    id: cfg.id,
    isEnabled: cfg.isEnabled ?? (() => true),
    getBounds(): Bounds {
      const r = cfg.bounds ? cfg.bounds() : cfg.object.getBounds();
      return { x: r.x, y: r.y, width: r.width, height: r.height, center: { x: r.centerX, y: r.centerY } };
    },
    onFocus: cfg.onFocus,
    onBlur: cfg.onBlur,
    onSelect: cfg.onSelect ?? (() => undefined),
    handleKey: cfg.handleKey,
    handleDirection: cfg.handleDirection,
  };
}

export interface ScopeConfig {
  id: string;
  members: () => Focusable[];
  boundaryOverride?: FocusScope['boundaryOverride'];
  onSelectConfirm?: () => void;
  onCancel?: () => void;
}

/** Build a FocusScope (starts INACTIVE; the router flips its state). */
export function createScope(cfg: ScopeConfig): FocusScope {
  return {
    id: cfg.id,
    state: ScopeState.INACTIVE,
    members: cfg.members,
    boundaryOverride: cfg.boundaryOverride,
    onSelectConfirm: cfg.onSelectConfirm,
    onCancel: cfg.onCancel,
    lastFocusedId: undefined,
  };
}
