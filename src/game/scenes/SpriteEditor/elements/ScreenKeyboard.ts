import Phaser from 'phaser';

export interface ScreenKeyboardConfig {
  scene: Phaser.Scene;
  onKeyDown: (code: string, event: KeyboardEvent) => void;
  onKeyUp?: (code: string, event: KeyboardEvent) => void;
  shouldHandleKeyDown?: (event: KeyboardEvent) => boolean;
  canAttach?: () => boolean;
  preventRepeat?: boolean;
  deferAttach?: boolean;
}

/**
 * Shared keyboard lifecycle helper for screen-level navigation.
 * Handles listener attach/detach, held-key repeat suppression,
 * and optional one-frame deferred attachment.
 */
export class ScreenKeyboard {
  private readonly scene: Phaser.Scene;
  private readonly onKeyDown: (code: string, event: KeyboardEvent) => void;
  private readonly onKeyUp?: (code: string, event: KeyboardEvent) => void;
  private readonly shouldHandleKeyDown?: (event: KeyboardEvent) => boolean;
  private readonly canAttach?: () => boolean;
  private readonly preventRepeat: boolean;
  private readonly deferAttach: boolean;

  private heldKeys = new Set<string>();
  private isAttached = false;
  private isDisposed = false;
  private attachTimer?: Phaser.Time.TimerEvent;

  constructor(config: ScreenKeyboardConfig) {
    this.scene = config.scene;
    this.onKeyDown = config.onKeyDown;
    this.onKeyUp = config.onKeyUp;
    this.shouldHandleKeyDown = config.shouldHandleKeyDown;
    this.canAttach = config.canAttach;
    this.preventRepeat = config.preventRepeat ?? true;
    this.deferAttach = config.deferAttach ?? false;
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
    if (!this.isAttached) return;

    this.scene.input.keyboard?.off('keydown', this.keydownHandler);
    this.scene.input.keyboard?.off('keyup', this.keyupHandler);
    this.isAttached = false;
  }

  clearHeldKeys() {
    this.heldKeys.clear();
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

  private readonly keydownHandler = (event: KeyboardEvent) => {
    if (this.shouldHandleKeyDown && !this.shouldHandleKeyDown(event)) {
      return;
    }

    if (this.preventRepeat) {
      if (this.heldKeys.has(event.code)) return;
      this.heldKeys.add(event.code);
    }

    this.onKeyDown(event.code, event);
  };

  private readonly keyupHandler = (event: KeyboardEvent) => {
    if (this.preventRepeat) {
      this.heldKeys.delete(event.code);
    }
    this.onKeyUp?.(event.code, event);
  };
}
