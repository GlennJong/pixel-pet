import Phaser from 'phaser';

export interface ScreenKeyboardConfig {
  scene: Phaser.Scene;
  onKeyDown: (code: string, event: KeyboardEvent) => void;
  onKeyUp?: (code: string, event: KeyboardEvent) => void;
  shouldHandleKeyDown?: (event: KeyboardEvent) => boolean;
  canAttach?: () => boolean;
  preventRepeat?: boolean;
  deferAttach?: boolean;
  /**
   * Codes that auto-repeat while held (defaults to the four arrows). Holding one
   * re-fires onKeyDown after `repeatDelayMs`, then every `repeatIntervalMs`, at a
   * steady rate independent of the OS key-repeat settings. Pass `[]` to disable.
   */
  repeatCodes?: string[];
  repeatDelayMs?: number;
  repeatIntervalMs?: number;
}

const DEFAULT_REPEAT_CODES = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const DEFAULT_REPEAT_DELAY_MS = 350;
const DEFAULT_REPEAT_INTERVAL_MS = 60;

/**
 * Shared keyboard lifecycle helper for screen-level navigation.
 * Handles listener attach/detach, held-key repeat suppression, optional
 * one-frame deferred attachment, and press-and-hold auto-repeat for the arrows.
 */
export class ScreenKeyboard {
  private readonly scene: Phaser.Scene;
  private readonly onKeyDown: (code: string, event: KeyboardEvent) => void;
  private readonly onKeyUp?: (code: string, event: KeyboardEvent) => void;
  private readonly shouldHandleKeyDown?: (event: KeyboardEvent) => boolean;
  private readonly canAttach?: () => boolean;
  private readonly preventRepeat: boolean;
  private readonly deferAttach: boolean;
  private readonly repeatCodes: Set<string>;
  private readonly repeatDelayMs: number;
  private readonly repeatIntervalMs: number;

  private heldKeys = new Set<string>();
  private isAttached = false;
  private isDisposed = false;
  private attachTimer?: Phaser.Time.TimerEvent;

  // Press-and-hold auto-repeat state (one key repeats at a time — the last held).
  private repeatCode?: string;
  private repeatEvent?: KeyboardEvent;
  private repeatDelayTimer?: Phaser.Time.TimerEvent;
  private repeatIntervalTimer?: Phaser.Time.TimerEvent;

  constructor(config: ScreenKeyboardConfig) {
    this.scene = config.scene;
    this.onKeyDown = config.onKeyDown;
    this.onKeyUp = config.onKeyUp;
    this.shouldHandleKeyDown = config.shouldHandleKeyDown;
    this.canAttach = config.canAttach;
    this.preventRepeat = config.preventRepeat ?? true;
    this.deferAttach = config.deferAttach ?? false;
    this.repeatCodes = new Set(config.repeatCodes ?? DEFAULT_REPEAT_CODES);
    this.repeatDelayMs = config.repeatDelayMs ?? DEFAULT_REPEAT_DELAY_MS;
    this.repeatIntervalMs = config.repeatIntervalMs ?? DEFAULT_REPEAT_INTERVAL_MS;
  }

  attach() {
    if (this.isDisposed || this.isAttached || this.attachTimer) return;

    if (this.deferAttach) {
      this.attachTimer = this.scene.time.delayedCall(0, () => {
        this.attachTimer = undefined;
        this.attachNow();
      });
      return;
    }

    this.attachNow();
  }

  detach() {
    this.clearAttachTimer();
    this.stopRepeat();
    if (!this.isAttached) return;

    this.scene.input.keyboard?.off('keydown', this.keydownHandler);
    this.scene.input.keyboard?.off('keyup', this.keyupHandler);
    this.isAttached = false;
  }

  clearHeldKeys() {
    this.heldKeys.clear();
    this.stopRepeat();
  }

  pause() {
    this.detach();
    this.clearHeldKeys();
  }

  resume() {
    this.clearHeldKeys();
    this.attach();
  }

  destroy() {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.pause();
  }

  private attachNow() {
    if (this.isDisposed || this.isAttached) return;
    if (this.canAttach && !this.canAttach()) return;
    if (!this.scene.input.keyboard) return;

    this.scene.input.keyboard.on('keydown', this.keydownHandler);
    this.scene.input.keyboard.on('keyup', this.keyupHandler);
    this.isAttached = true;
  }

  private clearAttachTimer() {
    if (!this.attachTimer) return;
    this.attachTimer.remove(false);
    this.attachTimer = undefined;
  }

  // ── Auto-repeat ──────────────────────────────────────────────────────────────

  private startRepeat(code: string, event: KeyboardEvent) {
    this.stopRepeat();
    this.repeatCode = code;
    this.repeatEvent = event;
    this.repeatDelayTimer = this.scene.time.delayedCall(this.repeatDelayMs, () => {
      this.repeatDelayTimer = undefined;
      this.repeatIntervalTimer = this.scene.time.addEvent({
        delay: this.repeatIntervalMs,
        loop: true,
        callback: this.fireRepeat,
      });
    });
  }

  private stopRepeat() {
    this.repeatDelayTimer?.remove(false);
    this.repeatIntervalTimer?.remove(false);
    this.repeatDelayTimer = undefined;
    this.repeatIntervalTimer = undefined;
    this.repeatCode = undefined;
    this.repeatEvent = undefined;
  }

  private readonly fireRepeat = () => {
    if (!this.repeatCode || !this.repeatEvent) { this.stopRepeat(); return; }
    // Respect the same gate as live keydowns (e.g. a text field grabbed focus).
    if (this.shouldHandleKeyDown && !this.shouldHandleKeyDown(this.repeatEvent)) {
      this.stopRepeat();
      return;
    }
    this.onKeyDown(this.repeatCode, this.repeatEvent);
  };

  // ── Handlers ──────────────────────────────────────────────────────────────────

  private readonly keydownHandler = (event: KeyboardEvent) => {
    if (this.shouldHandleKeyDown && !this.shouldHandleKeyDown(event)) {
      return;
    }

    if (this.preventRepeat) {
      if (this.heldKeys.has(event.code)) return; // ignore OS auto-repeat
      this.heldKeys.add(event.code);
    }

    this.onKeyDown(event.code, event);

    // Begin press-and-hold repeat for the held navigation key.
    if (this.repeatCodes.has(event.code)) this.startRepeat(event.code, event);
  };

  private readonly keyupHandler = (event: KeyboardEvent) => {
    if (this.preventRepeat) {
      this.heldKeys.delete(event.code);
    }
    if (event.code === this.repeatCode) this.stopRepeat();
    this.onKeyUp?.(event.code, event);
  };
}
