import Phaser from 'phaser';
import { ButtonConfig } from '../elements';
import { Focusable } from '@/game/ui/focus';
import { EditorScreen } from '../screens/EditorScreen';
import { EditorState, WorkspaceAtlasEntry } from '../types';

/**
 * The editor's navigation model.
 *
 * Two kinds of state live here and must not be mixed:
 *
 *  - {@link ViewState} — which screen, which overlays, which nav sub-menu. Small,
 *    printable, and the only thing that triggers a rebuild.
 *  - {@link EditorState} — the project being edited (images, sprites, name). It is
 *    an *input* to rendering, never a trigger: importing an image must not tear
 *    down and rebuild the screen showing it.
 *
 * Screens never construct the bottom bar. They declare what belongs in it (see
 * {@link ScreenSpec.nav}) and the host renders exactly one, so two bars can
 * never occupy the same strip and nothing needs to be suppressed.
 */

export type ScreenId = 'picker' | 'library' | 'sprites' | 'frames';

/** A nav sub-menu that temporarily replaces a screen's own buttons. */
export type NavModeId = 'save';

/** Transient arguments a screen is opened with, carried in the view state. */
export type ScreenParams =
  /**
   * `root: false` is the picker reached from the library ("load other data"):
   * same screen, but its action bar says CANCEL and leads back rather than out
   * of the editor.
   */
  | { screen: 'picker'; root?: boolean }
  | {
      screen: 'library';
      /**
       * Where to go when the user is done here. Set when the library was a
       * detour from somewhere specific — picking frames for one sprite, say —
       * so finishing returns to that exact place instead of dropping the user
       * at the top of the sprite list to find it again.
       */
      returnTo?: ScreenParams;
      /** 'menu' forces the entry menu; omitted goes straight to the material. */
      startIn?: 'menu' | 'edit';
    }
  | { screen: 'sprites' }
  | { screen: 'frames'; spriteId: string; currentFrames: string[] };

/**
 * An overlay drawn over the current screen. These stack rather than occupy a
 * single slot: closing one must reveal whatever was beneath it.
 */
export interface OverlayState {
  kind: 'confirm';
  question: string;
  /**
   * The action to run on "yes", named rather than captured as a closure.
   * A name keeps the view state printable — `{screen:'library',
   * overlays:[{kind:'confirm',onYes:'create'}]}` says exactly what is pending —
   * and keeps the question and its consequence side by side in the registry
   * instead of at the call site. It resolves against the current screen's
   * actions; a screen cannot change while an overlay is up.
   */
  onYes?: string;
}

export interface ViewState {
  screen: ScreenId;
  params: ScreenParams;
  overlays: OverlayState[];
  navMode: NavModeId | null;
}

/**
 * Editor operations that are not navigation: the things the scene knows how to
 * do. Kept behind an interface so the registry reads as a list of intentions
 * rather than as reach-ins to the scene.
 */
export interface EditorApp {
  /** Load a picked atlas into the project and show the sprite editor. */
  openAtlas(atlas: WorkspaceAtlasEntry): Promise<void>;
  /** Snapshot the live sprite configs off the sprite-edit screen. */
  commitSprites(): void;
  applyCustomization(): Promise<void>;
  exportArtifacts(): Promise<void>;
  /** False while the library has nothing for the sprite editor to frame. */
  canLeaveLibrary(): boolean;
  /** Hand the frame-selector's result back to the card it was opened from. */
  applyFrames(spriteId: string, frameIds: string[]): void;
  /** Re-point the sprite cards at the current image pool after it changed. */
  syncImages(): void;
}

/** Everything a spec's callbacks are allowed to touch. */
export interface EditorContext {
  readonly scene: Phaser.Scene;
  readonly width: number;
  readonly height: number;
  /** The project being edited. Mutating it does not rebuild anything. */
  readonly data: EditorState;
  /** The atlas list for the picker, loaded once at boot. */
  readonly atlasList: readonly WorkspaceAtlasEntry[];
  /** The atlas the user picked, if any. */
  readonly selectedAtlas: WorkspaceAtlasEntry | undefined;
  readonly app: EditorApp;

  go(params: ScreenParams): void;
  /** The arguments the current screen was opened with. */
  params(): ScreenParams;
  /** Leave a detour screen, restoring the one it covered. */
  leaveDetour(fallback: ScreenParams): void;
  setNavMode(mode: NavModeId | null): void;
  /** Push a yes/no overlay; `onYes` names an action of the current screen. */
  confirm(question: string, onYes?: string): void;
  closeOverlay(): void;
  exitEditor(): void;
  banner(message: string, isError?: boolean): void;
  /** Re-read the nav (labels/disabled) without rebuilding the screen. */
  refreshNav(): void;

  /** The live screen instance, when a callback needs to ask it something. */
  screen<T extends EditorScreen>(): T | undefined;
  /** Build the shared nav as a focusable for this screen's own router. */
  navFocusable(enterContent: (edge: 'first' | 'last') => void, requestFocus: () => void): Focusable;
}

export interface ActionSpec {
  /**
   * Ask before running. Return the question, or null to run straight away.
   * Confirmation is an attribute of the transition, not a state of its own —
   * which is why adding a guarded button never adds a state.
   */
  confirm?: (ctx: EditorContext) => string | null;
  run: (ctx: EditorContext) => void | Promise<void>;
}

/**
 * `Events` maps a screen's event names to their payload types, so the registry
 * gets the payload typed instead of taking `any` at the one place a silent
 * mismatch would be invisible.
 */
export interface ScreenSpec<Events = Record<string, void>> {
  /**
   * The bottom bar for this screen, or null for a screen that has none.
   * A function, not an array: labels and disabled flags depend on live state
   * (`confirm(3)`, SPRITES greyed on an empty library).
   */
  nav: (ctx: EditorContext) => ButtonConfig[] | null;
  /**
   * Which edge the buttons pack against. Required, not defaulted: alignment is
   * visible to the user on every screen, so it belongs in the table they read
   * rather than in a default they have to remember.
   */
  navAlign: 'left' | 'right';
  build: (ctx: EditorContext) => EditorScreen;
  /**
   * Keyboard shortcuts this screen honours, as key code → action name, so a
   * shortcut is visible in the same table as the buttons. The screen reports
   * the key as an event; this records what it means.
   */
  shortcuts?: Record<string, string>;
  /**
   * Keep the screen underneath alive (hidden and paused) instead of tearing it
   * down, and restore it on the way back. For a screen that is really a detour
   * from another one — picking frames for a sprite card — rebuilding the screen
   * behind would reset its cursor and scroll on every return trip.
   *
   * The screen must expose `pause()` / `resume()`.
   */
  overlaysPrevious?: boolean;
  /** Nav button key → what it does. */
  actions?: Record<string, ActionSpec>;
  /** Screen event name → handler. Wired once, right after build. */
  events?: { [K in keyof Events]?: (ctx: EditorContext, payload: Events[K]) => void };
}
