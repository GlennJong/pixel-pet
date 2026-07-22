import Phaser from 'phaser';
import { ButtonBar } from './ButtonBar';
import { handleButtonBarKey } from './buttonBarNav';
import {
  COLORS,
  FONT,
  BUTTON_BAR_HEIGHT,
  hex,
} from '../constants';

export interface ConfirmDialogOptions {
  width: number;
  height: number;
  /** Button bar alignment for the CONFIRM/CANCEL row (default 'right'). */
  align?: 'left' | 'right';
  confirmLabel?: string;
  cancelLabel?: string;
}

/**
 * Shared modal confirm dialog used by editor screens.
 *
 * Layout: a translucent full-screen overlay, a centered message, and a
 * CONFIRM/CANCEL {@link ButtonBar} pinned to the bottom. The overlay is
 * interactive so clicks never reach the screen underneath while open.
 *
 * The dialog owns its own button bar and keyboard cursor navigation — the host
 * screen only needs to forward key codes via {@link handleKey} while
 * {@link isOpen}, and react to the events below.
 *
 * Events emitted:
 *   'confirm' – CONFIRM was activated
 *   'cancel'  – CANCEL was activated (or Escape / ArrowUp out of the bar)
 */
export class ConfirmDialog extends Phaser.GameObjects.Container {
  private overlay: Phaser.GameObjects.Rectangle;
  private messageText: Phaser.GameObjects.Text;
  private buttonBar: ButtonBar;
  private _isOpen = false;

  constructor(scene: Phaser.Scene, opts: ConfirmDialogOptions) {
    super(scene, 0, 0);

    const { width, height } = opts;
    const confirmLabel = opts.confirmLabel ?? 'CONFIRM';
    const cancelLabel = opts.cancelLabel ?? 'CANCEL';
    const buttonBarY = height - BUTTON_BAR_HEIGHT;

    // Full-screen translucent overlay; interactive so it swallows clicks meant
    // for the screen beneath while the dialog is open.
    this.overlay = scene.add
      .rectangle(0, 0, width, height, COLORS.BG, 0.85)
      .setOrigin(0, 0)
      .setInteractive();
    this.add(this.overlay);

    this.messageText = scene.add
      .text(width / 2, buttonBarY / 2, '', {
        fontFamily: FONT.FAMILY,
        fontSize: FONT.SIZE,
        color: hex(COLORS.TEXT),
        resolution: 1,
        align: 'center',
        wordWrap: { width: width - 16 },
        lineSpacing: 2,
      })
      .setOrigin(0.5);
    this.add(this.messageText);

    this.buttonBar = new ButtonBar(
      scene,
      buttonBarY,
      width,
      [
        { key: 'confirm', label: confirmLabel },
        { key: 'cancel', label: cancelLabel },
      ],
      opts.align ?? 'right',
    );
    this.buttonBar.on('action', (key: string) => {
      this.emit(key === 'confirm' ? 'confirm' : 'cancel');
    });
    this.add(this.buttonBar);

    scene.add.existing(this);
    this.setVisible(false);
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  /** Change which edge the CONFIRM/CANCEL buttons pack against, at any time. */
  setAlign(align: 'left' | 'right') {
    this.buttonBar.setAlign(align);
  }

  /** Show the dialog with `message`, focusing the button bar (cursor on CONFIRM). */
  open(message: string) {
    this._isOpen = true;
    this.messageText.setText(message);
    this.setVisible(true);
    this.buttonBar.activate();
    this.buttonBar.setCursorToFirst();
  }

  /** Hide the dialog and release its button-bar focus. */
  close() {
    this._isOpen = false;
    this.buttonBar.deactivate();
    this.setVisible(false);
  }

  /** Forward a key code from the host screen while the dialog is open. */
  handleKey(code: string) {
    handleButtonBarKey(this.buttonBar, code, {
      onExitUp: () => this.emit('cancel'),
      onEscape: () => this.emit('cancel'),
    });
  }
}
