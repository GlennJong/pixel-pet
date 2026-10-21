import Phaser from 'phaser';
import { ScreenKeyboard } from '@/game/ui';
import { FocusRouter, FocusScope, Focusable, createScope } from '@/game/ui/focus';
import { COLORS, cjkStyle } from '../constants';

/**
 * What a screen gets from the host to reach the shared bottom bar. The host
 * owns the one bar; a screen only borrows it as the last member of its own
 * focus scope. `enterContent` is the bar's way back into the screen's content
 * (Escape on the bar), `requestFocus` the bar's pointer events pulling focus
 * onto it — both bound to the screen's router, so mouse and keyboard never
 * disagree about where focus is.
 */
export interface NavHost {
  buildNavFocusable(
    enterContent: (edge: 'first' | 'last') => void,
    requestFocus: () => void,
  ): Focusable;
}

export interface ContentScopeOptions {
  /** Scope id, for debugging. */
  id: string;
  /** What sits above the bar, top to bottom. The bar is appended as 'nav'. */
  content: Focusable[];
  navHost: NavHost;
  /** Escape with nothing in front of the screen. */
  onCancel?: () => void;
  /**
   * Bridge the two ends: content-top ↑ goes to the bar, bar ↓ to the top of
   * the content. Default on; off for a screen whose ↓ on the bar would bounce
   * straight back out of the content (typing, say).
   */
  wrap?: boolean;
  /** Escape on the bar. Default: the edge of the content. */
  enterContent?: (edge: 'first' | 'last') => void;
  /** Member to focus first. Default: the first of `content`. */
  initial?: string;
}

/**
 * Base for every editor screen.
 *
 * A screen is a Container the host builds, shows, and destroys. Most are the
 * same shape — a background, maybe a title, content, and the shared bar below —
 * so the parts every one of them needs live here:
 *
 *   addBackground / addTitle  – the chrome
 *   mountContent              – one focus scope: content above, the bar below
 *   listen                    – the keyboard, feeding the router
 *
 * A screen with its own focus model (two modes, a modal scope) still uses
 * {@link router} and {@link listen}, and builds its scopes itself.
 *
 * Owns the {@link ScreenKeyboard} and tears it down on destroy, so no screen
 * can leak its global keydown handler.
 */
export abstract class BaseScreen extends Phaser.GameObjects.Container {
  protected readonly router = new FocusRouter();
  protected keyboard!: ScreenKeyboard;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
  }

  /**
   * Stop/resume reacting to keys, without otherwise disturbing the screen.
   * Used when something in front of it takes over the keyboard — a confirm
   * dialog, say. Two live keydown listeners would both act on the same press.
   */
  pauseInput() { this.keyboard?.pause(); }
  resumeInput() { this.keyboard?.resume(); }

  /**
   * Park / restore the whole screen while a detour covers it (see
   * ScreenSpec.overlaysPrevious): the router stops too, so nothing it owns
   * keeps reacting under the screen in front.
   */
  pause() {
    this.router.pause();
    this.keyboard?.pause();
  }

  resume() {
    this.keyboard?.resume();
    this.router.resume();
  }

  destroy(fromScene?: boolean) {
    this.keyboard?.destroy();
    super.destroy(fromScene);
  }

  // ── Building blocks ────────────────────────────────────────────────────────

  protected addBackground(width: number, height: number) {
    const bg = this.scene.add.rectangle(0, 0, width, height, COLORS.BG).setOrigin(0, 0);
    this.add(bg);
    return bg;
  }

  /** One line along the top saying where the user is ("照顧 › 吃飯"). */
  protected addTitle(text: string, x = 3, y = 2) {
    const title = this.scene.add.text(x, y, text, cjkStyle());
    this.add(title);
    return title;
  }

  /**
   * The usual focus model: the content, then the shared bar, in one scope.
   * Call after the content exists; returns the scope for a screen that swaps
   * between several.
   */
  protected mountContent(opts: ContentScopeOptions): FocusScope {
    const first = opts.content[0]?.id;
    const bar = opts.navHost.buildNavFocusable(
      opts.enterContent ?? ((edge) => this.router.focusEdge(edge, 'nav')),
      () => this.router.focusId('nav'),
    );
    const scope = createScope({
      id: opts.id,
      members: () => [...opts.content, bar],
      onCancel: opts.onCancel,
      boundaryOverride: opts.wrap === false || !first ? undefined : {
        UP: () => this.router.focusId('nav', 'UP'),
        DOWN: () => this.router.focusId(first, 'DOWN'),
      },
    });
    this.router.setBaseScope(scope, opts.initial ?? first ?? 'first');
    return scope;
  }

  /**
   * Put the screen on the scene and start feeding keys to the router.
   *
   * Attaching waits a tick by default: the key that opened this screen is
   * still down, and would otherwise be read again here.
   */
  protected listen(opts: { shouldHandleKeyDown?: (event: KeyboardEvent) => boolean; deferAttach?: boolean } = {}) {
    this.keyboard = new ScreenKeyboard({
      scene: this.scene,
      canAttach: () => this.active,
      deferAttach: opts.deferAttach ?? true,
      shouldHandleKeyDown: opts.shouldHandleKeyDown,
      onKeyDown: (code: string) => this.router.handleKey(code),
    });
    this.scene.add.existing(this);
    this.keyboard.attach();
  }
}
