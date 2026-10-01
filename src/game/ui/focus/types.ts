/**
 * Core types for the hybrid spatial focus-navigation system.
 *
 * A screen declares one or more `FocusScope`s, each exposing a dynamic list of
 * `Focusable` items. The `FocusRouter` routes arrow keys by geometry within the
 * active scope, delegates edit-mode keys to the focused item first, and bridges
 * scope edges via `boundaryOverride`. Adapted from `Spatial Navigator.md`.
 */

export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export enum ScopeState {
  INACTIVE = 'INACTIVE',
  ACTIVE = 'ACTIVE',
  TRANSITIONING = 'TRANSITIONING', // input ignored during major layout transitions
}

export interface Point2D {
  x: number;
  y: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
  center: Point2D;
}

/**
 * A navigable atom. Sub-parts of an element (a grid cell, a menu row, a nav
 * button, a number field) each implement this. The router only reads geometry
 * and toggles focus; the item renders its own highlight in onFocus/onBlur.
 */
export interface Focusable {
  readonly id: string;
  /** Availability gate (off-screen / paged-out / contextually hidden → false). */
  isEnabled(): boolean;
  /** Absolute screen-space bounds (+ precomputed center). */
  getBounds(): Bounds;
  /** Gain focus. `from` is the travel direction (undefined for a direct focus),
   *  so widgets can place their internal cursor at the entered edge. */
  onFocus(from?: Direction): void;
  onBlur(): void;
  /** Space activates. */
  onSelect(): void;
  /**
   * Edit-mode raw-key capture (text typing, backspace). Return true to consume
   * the key so the router does not treat it as navigation.
   */
  handleKey?(code: string): boolean;
  /**
   * Edit-mode directional capture (slider ± on Left/Right, text caret). Return
   * true to consume so the router does not move focus spatially.
   */
  handleDirection?(dir: Direction): boolean;
}

/** A boundary target: a member id to focus, or a callback (bridge / wrap). */
export type BoundaryTarget = string | (() => void);

export interface FocusScope {
  readonly id: string;
  state: ScopeState;
  /** Current members — dynamic so pagination / availability can change. */
  members(): Focusable[];
  /** What to do when a direction finds no in-scope candidate (edge / wrap). */
  boundaryOverride?: Partial<Record<Direction, BoundaryTarget>>;
  /** Enter shortcut (e.g. confirm the whole selection); falls back to onSelect. */
  onSelectConfirm?(): void;
  /** Escape when no modal is stacked (e.g. leave screen / clear selection). */
  onCancel?(): void;
  /** Focus memory: the last focused member id, restored on re-entry. */
  lastFocusedId?: string;
}
