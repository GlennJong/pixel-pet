import Phaser from 'phaser';
import { ButtonBar, ButtonConfig, ConfirmDialog } from '../elements';
import { ScreenKeyboard } from '@/game/ui';
import { createScope, Focusable, FocusRouter } from '@/game/ui/focus';
import { EditorScreen } from '../screens/EditorScreen';
import { BUTTON_BAR_HEIGHT } from '../constants';
import {
  ActionSpec,
  EditorContext,
  NavModeId,
  OverlayState,
  ScreenId,
  ScreenParams,
  ScreenSpec,
  ViewState,
} from './types';

/**
 * A declared shortcut that names nothing is worse than an undeclared one: the
 * table says the key does something it does not. Checked in dev only, when the
 * screen is built, since the registry cannot be unit-tested without Phaser.
 */
function warnOnDanglingShortcuts(id: ScreenId, spec: ScreenSpec<any>) {
  for (const [code, name] of Object.entries(spec.shortcuts ?? {})) {
    const known = Boolean(spec.actions?.[name]) || Boolean((spec.events as Record<string, unknown>)?.[name]);
    if (!known) {
      console.warn(`[SpriteEditor] ${id}: shortcut ${code} names "${name}", which is neither an action nor an event.`);
    }
  }
}

/** Screens that can be parked expose these; everything else ignores them. */
interface PausableScreen { pause?: () => void; resume?: () => void }
const pauseScreen = (s: EditorScreen) => (s as unknown as PausableScreen).pause?.();
const resumeScreen = (s: EditorScreen) => (s as unknown as PausableScreen).resume?.();


/**
 * Runs the navigation model: holds the view state, builds the screen the state
 * names, and owns the one and only bottom bar.
 *
 * Deliberately not a renderer. Phaser objects are expensive to create — a screen
 * registers a global keydown handler, loads textures, and in one case appends a
 * DOM file input — so rebuilding on every state change would make importing an
 * image tear down the screen showing it. The rule is narrow and explicit:
 *
 *   screen identity changed → tear down, build again
 *   anything else changed   → only the nav is recomputed
 *
 * That is a guard, not a diff. There is no reconciler and no keyed children.
 */
export interface ScreenHostDeps {
  scene: Phaser.Scene;
  width: number;
  height: number;
  registry: Record<ScreenId, ScreenSpec<any>>;
  navModes: Record<NavModeId, { buttons: ButtonConfig[]; actions: Record<string, ActionSpec> }>;
  /** Everything in the context that is not navigation itself. */
  context: Omit<
    EditorContext,
    | 'go' | 'params' | 'leaveDetour' | 'setNavMode' | 'confirm' | 'closeOverlay'
    | 'refreshNav' | 'screen' | 'navFocusable'
  >;
}

export class ScreenHost {
  private readonly deps: ScreenHostDeps;
  private readonly navBar: ButtonBar;

  private state: ViewState;
  private current?: EditorScreen;
  /** The screen a detour screen is covering, kept alive to return to. */
  private covered?: {
    screen: EditorScreen;
    params: ScreenParams;
    spec: ScreenSpec<any>;
    requestFocus?: () => void;
  };
  /**
   * Where the shared bar's pointer events go. One field rather than a listener
   * per screen: the bar outlives every screen, so a screen restored from a
   * detour would otherwise still be pointing the bar at the router of the
   * screen that covered it — which by then is destroyed.
   */
  private navRequestFocus?: () => void;
  /** Screen whose nav refresh already reported a failure. */
  private navErrorScreen?: ScreenId;
  /** The spec driving `current`; kept so actions resolve against the live screen. */
  private currentSpec?: ScreenSpec<any>;
  private navMode: { buttons: ButtonConfig[]; actions: Record<string, ActionSpec> } | null = null;
  /** Last applied nav, so the per-frame refresh is a string compare. */
  private navSignature: string | null = null;
  /** True while an action's async `run` is in flight — blocks double activation. */
  private dispatching = false;
  /**
   * Temporary: a screen has put a bar of its own over the strip (the library's
   * multi-select actions, its depose dialog). Goes away once those become
   * overlays on the stack — then "covered" is just the top of the stack and
   * nothing needs to announce it.
   */
  private suppressed = false;
  /** Built on first use: most sessions never ask a question. */
  private dialog?: ConfirmDialog;
  private dialogRouter?: FocusRouter;
  private dialogKeyboard?: ScreenKeyboard;
  /** Built once: every field is either stable or a bound method. */
  private readonly ctx: EditorContext;

  constructor(deps: ScreenHostDeps, initial: ScreenParams) {
    this.deps = deps;
    this.state = { screen: initial.screen, params: initial, overlays: [], navMode: null };


    this.navBar = new ButtonBar(
      deps.scene,
      deps.height - BUTTON_BAR_HEIGHT,
      deps.width,
      [],
      'left',
    );
    this.navBar.setDepth(500);
    this.navBar.on('action', (key: string) => void this.dispatch(key));
    this.navBar.on('request-focus', () => this.navRequestFocus?.());
    this.ctx = this.buildContext();

    this.buildScreen();
  }

  // ── Public surface ─────────────────────────────────────────────────────────

  get screenId(): ScreenId { return this.state.screen; }
  get activeScreen(): EditorScreen | undefined { return this.current; }
  /** The current view state, for logging. Treat as read-only. */
  get viewState(): Readonly<ViewState> { return this.state; }

  /** Called from the scene's update(): recompute only the cheap parts. */
  update() {
    // A throw here would propagate out of the scene's update step and stop the
    // systems that run after it — input among them, which reads as "the
    // keyboard died" rather than as the cosmetic refresh it is. Logged once per
    // screen so the cause is visible without flooding the console.
    try {
      this.refreshNav();
    } catch (error) {
      if (this.navErrorScreen !== this.state.screen) {
        this.navErrorScreen = this.state.screen;
        console.error(`[SpriteEditor] nav refresh failed on "${this.state.screen}"`, error);
      }
    }
    (this.current as unknown as { update?: () => void })?.update?.();
  }

  /**
   * Navigate. This always rebuilds, by design: `go` is an explicit command, and
   * the "don't rebuild" rule is about *data* changes — those never call it.
   */
  go(params: ScreenParams) {
    this.state = { screen: params.screen, params, overlays: [], navMode: null };
    this.navMode = null;
    this.buildScreen();
  }

  /** Swap the bar to a nav sub-menu, or back to the screen's own buttons. */
  enterNavMode(mode: NavModeId | null) {
    this.state.navMode = mode;
    this.navMode = mode ? this.deps.navModes[mode] ?? null : null;
    this.navSignature = null;
    this.refreshNav();
    // Focus stays on the 'nav' focusable either way; only the buttons change,
    // so the cursor is re-homed to the first of the new set.
    this.navBar.activate();
    this.navBar.setCursorToFirst();
  }

  setNavSuppressed(suppressed: boolean) {
    if (this.suppressed === suppressed) return;
    this.suppressed = suppressed;
    this.navSignature = null;
    this.refreshNav();
  }

  pushOverlay(overlay: OverlayState) {
    this.state.overlays.push(overlay);
    this.showDialog(overlay.question);
    this.setNavSuppressed(true);
  }

  popOverlay(): OverlayState | undefined {
    const gone = this.state.overlays.pop();
    if (this.state.overlays.length === 0) this.hideDialog();
    else this.showDialog(this.topOverlay!.question);
    this.setNavSuppressed(this.state.overlays.length > 0);
    return gone;
  }

  /**
   * The question UI. The dialog carries its own buttons and takes the keyboard
   * from the screen behind it: leaving both listening would let one press both
   * answer the question and move the cursor underneath.
   */
  private showDialog(question: string) {
    if (!this.dialog) {
      this.dialog = new ConfirmDialog(this.deps.scene, {
        width: this.deps.width,
        height: this.deps.height,
      });
      this.dialog.setDepth(900);
      this.dialog.on('confirm', () => void this.resolveConfirm(true));
      this.dialog.on('cancel', () => void this.resolveConfirm(false));

      this.dialogRouter = new FocusRouter();
      this.dialogRouter.setBaseScope(
        createScope({
          id: 'host-confirm',
          members: () => [this.dialog!.asFocusable('confirm-dialog')],
        }),
        'confirm-dialog',
      );
      this.dialogKeyboard = new ScreenKeyboard({
        scene: this.deps.scene,
        deferAttach: true,
        canAttach: () => this.state.overlays.length > 0,
        onKeyDown: (code) => this.dialogRouter?.handleKey(code),
      });
    }

    this.current?.pauseInput();
    this.dialog.open(question);
    this.dialogKeyboard?.resume();
  }

  private hideDialog() {
    this.dialog?.close();
    this.dialogKeyboard?.pause();
    this.current?.resumeInput();
  }

  get topOverlay(): OverlayState | undefined {
    return this.state.overlays[this.state.overlays.length - 1];
  }

  /**
   * Run a nav action, asking first when its spec says to. The question and its
   * consequence stay together in the registry, so a guarded button adds a line
   * rather than a state.
   */
  async dispatch(key: string) {
    if (this.dispatching) return;

    const action = this.navMode?.actions[key] ?? this.currentSpec?.actions?.[key];
    if (!action) return;

    const ctx = this.context();
    const question = action.confirm?.(ctx) ?? null;
    if (question) {
      this.pushOverlay({ kind: 'confirm', question, onYes: key });
      return;
    }

    // An async run (loading an atlas, say) leaves the bar live; without this the
    // user can press the button again while the first press is still working.
    this.dispatching = true;
    this.refreshNav();
    try {
      await action.run(ctx);
    } finally {
      this.dispatching = false;
      this.navSignature = null;
      this.refreshNav();
    }
  }

  /**
   * Leave a detour screen and restore the one it covered. Falls back to a plain
   * `go` when there is nothing parked (the screen was reached some other way).
   */
  leaveDetour(fallback: ScreenParams) {
    const parked = this.covered;
    if (!parked) { this.go(fallback); return; }

    this.covered = undefined;
    this.current?.destroy();

    this.current = parked.screen;
    this.currentSpec = parked.spec;
    this.state = { screen: parked.params.screen, params: parked.params, overlays: [], navMode: null };
    this.navMode = null;

    parked.screen.setVisible(true);
    // Point the bar back at the restored screen's router before resuming it.
    this.navRequestFocus = parked.requestFocus;
    resumeScreen(parked.screen);

    this.navBar.setAlign(parked.spec.navAlign);
    this.navSignature = null;
    this.refreshNav();
    this.navBar.deactivate();
  }

  /** The parked screen, when a caller needs to hand it the detour's result. */
  coveredScreen<T extends EditorScreen>(): T | undefined {
    return this.covered?.screen as T | undefined;
  }

  /** Answer the top confirm overlay. */
  async resolveConfirm(yes: boolean) {
    const overlay = this.popOverlay();
    if (!yes || overlay?.kind !== 'confirm' || !overlay.onYes) return;

    const action = this.currentSpec?.actions?.[overlay.onYes];
    if (!action) return;
    // Already confirmed — run it directly, or it would ask again.
    this.dispatching = true;
    try {
      await action.run(this.context());
    } finally {
      this.dispatching = false;
      this.navSignature = null;
      this.refreshNav();
    }
  }

  /** The shared nav as a focusable for the active screen's own router. */
  navFocusable(
    enterContent: (edge: 'first' | 'last') => void,
    requestFocus: () => void,
  ): Focusable {
    this.navRequestFocus = requestFocus;

    return this.navBar.asFocusable('nav', {
      isEnabled: () => this.navBar.visible && !this.suppressed,
      homeOnEnter: 'first',
      onBlur: () => {
        // Losing focus closes a nav sub-menu: Escape is not the only way out of
        // the bar, and leaving the sub-menu up would put its first button under
        // the cursor the next time the nav is focused.
        if (this.state.navMode) this.exitNavMode();
      },
      handleKey: (code) => {
        if (code !== 'Escape') return false;
        if (this.state.navMode) { this.exitNavMode(); return true; }
        enterContent('last');
        return true;
      },
      // Trap vertical movement inside the bar while a sub-menu is open;
      // otherwise defer to the bar's own contract so the router can move out.
      handleDirection: (dir) =>
        (dir === 'UP' || dir === 'DOWN') ? this.state.navMode !== null : undefined,
    });
  }

  /** Leave a nav sub-menu. `refocus` false when the bar is losing focus anyway. */
  exitNavMode(refocus = true) {
    this.state.navMode = null;
    this.navMode = null;
    this.navSignature = null;
    this.refreshNav();
    if (!refocus) return;
    this.navBar.activate();
    this.navBar.setCursorToFirst();
  }

  destroy() {
    this.dialogKeyboard?.destroy();
    this.dialog?.destroy();
    this.current?.destroy();
    this.covered?.screen.destroy();
    this.current = undefined;
    this.covered = undefined;
    this.navBar.destroy();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private context(): EditorContext {
    return this.ctx;
  }

  private buildContext(): EditorContext {
    return {
      ...this.deps.context,
      go: (params) => this.go(params),
      params: () => this.state.params,
      leaveDetour: (fallback) => this.leaveDetour(fallback),
      setNavMode: (mode) => this.enterNavMode(mode),
      confirm: (question, onYes) => this.pushOverlay({ kind: 'confirm', question, onYes }),
      closeOverlay: () => { this.popOverlay(); },
      refreshNav: () => { this.navSignature = null; this.refreshNav(); },
      screen: <T extends EditorScreen>() => this.current as T | undefined,
      navFocusable: (enter, request) => this.navFocusable(enter, request),
    };
  }

  private buildScreen() {
    const spec = this.deps.registry[this.state.screen];
    this.suppressed = false;

    if (spec.overlaysPrevious && this.current && this.currentSpec) {
      // Only one screen can be parked; a second detour would strand the first.
      this.covered?.screen.destroy();
      // A detour: park the screen underneath rather than destroying it, so the
      // return trip restores its cursor instead of resetting it.
      pauseScreen(this.current);
      this.current.setVisible(false);
      this.covered = {
        screen: this.current,
        params: this.state.params,
        spec: this.currentSpec,
        requestFocus: this.navRequestFocus,
      };
    } else {
      this.current?.destroy();
      this.covered?.screen.destroy();
      this.covered = undefined;
    }
    this.current = undefined;

    this.currentSpec = spec;
    this.navErrorScreen = undefined;

    const ctx = this.context();
    const screen = spec.build(ctx);
    this.current = screen;

    // Temporary bridge, paired with setNavSuppressed: a screen that still owns
    // a bar of its own says so, and the shared one steps aside.
    screen.on('nav-suppress', (on: boolean) => this.setNavSuppressed(on));

    for (const [event, handler] of Object.entries(spec.events ?? {})) {
      screen.on(event, (payload: unknown) =>
        (handler as (c: EditorContext, p: unknown) => void)(this.context(), payload),
      );
    }

    if (import.meta.env.DEV) warnOnDanglingShortcuts(this.state.screen, spec);

    this.navBar.setAlign(spec.navAlign);
    this.navSignature = null;
    this.refreshNav();
    this.navBar.deactivate(); // focus starts on screen content, not the nav
  }

  /**
   * Recompute the bar from the current state. Cheap by design: it runs every
   * frame, and an unchanged signature early-outs after one string compare.
   */
  private refreshNav() {
    const buttons = this.suppressed
      ? null
      : this.navMode?.buttons ?? this.currentSpec?.nav(this.context()) ?? null;

    if (!buttons || buttons.length === 0) {
      this.navBar.setVisible(false);
      this.navSignature = 'hidden';
      return;
    }

    const disabledByDispatch = this.dispatching;
    const signature = buttons
      .map((b) => `${b.key}:${b.label}:${b.disabled || disabledByDispatch ? 1 : 0}`)
      .join('|');
    if (signature === this.navSignature) return;
    this.navSignature = signature;

    this.navBar.setVisible(true);
    this.navBar.setButtons(
      disabledByDispatch ? buttons.map((b) => ({ ...b, disabled: true })) : buttons,
    );
  }
}
