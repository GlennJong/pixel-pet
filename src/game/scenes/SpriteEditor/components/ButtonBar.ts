import Phaser from 'phaser';
import {
  COLORS,
  FONT,
  BUTTON_BAR_HEIGHT,
  BUTTON_HEIGHT,
  BUTTON_PADDING_X,
  BUTTON_GAP,
  BUTTON_BAR_PADDING_RIGHT,
} from '../constants';

export interface ButtonConfig {
  key: string;
  label: string;
}

/**
 * Fixed-height bar anchored at the bottom of the screen.
 * Buttons are right-aligned. Keyboard cursor moves left/right; Space executes.
 *
 * Events emitted:
 *   'action' (key: string) – button was activated
 */
export class ButtonBar extends Phaser.GameObjects.Container {
  private barBg!: Phaser.GameObjects.Rectangle;
  private buttonBgs: Phaser.GameObjects.Rectangle[] = [];
  private buttonTexts: Phaser.GameObjects.Text[] = [];
  private buttonBorders: Phaser.GameObjects.Graphics[] = [];
  private buttonConfigs: ButtonConfig[] = [];

  private _cursorIndex = 0;
  private _hasFocus = false;
  private readonly barWidth: number;

  constructor(
    scene: Phaser.Scene,
    y: number,
    barWidth: number,
    buttons: ButtonConfig[],
  ) {
    super(scene, 0, y);
    this.barWidth = barWidth;

    this.barBg = scene.add
      .rectangle(0, 0, barWidth, BUTTON_BAR_HEIGHT, COLORS.BUTTON_BAR_BG)
      .setOrigin(0, 0);
    this.add(this.barBg);

    scene.add.existing(this);
    this.setButtons(buttons);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get hasFocus() { return this._hasFocus; }
  get cursorIndex() { return this._cursorIndex; }

  setButtons(buttons: ButtonConfig[]) {
    this.clearButtons();
    this.buttonConfigs = [...buttons];
    this._cursorIndex = Math.min(this._cursorIndex, Math.max(0, buttons.length - 1));
    this.buildButtons();
  }

  activate() {
    this._hasFocus = true;
    this.refreshVisuals();
  }

  deactivate() {
    this._hasFocus = false;
    this.refreshVisuals();
  }

  moveCursor(delta: number) {
    const n = this.buttonConfigs.length;
    if (n === 0) return;
    this._cursorIndex = Phaser.Math.Clamp(this._cursorIndex + delta, 0, n - 1);
    this.refreshVisuals();
  }

  setCursorToFirst() {
    this._cursorIndex = 0;
    this.refreshVisuals();
  }

  setCursorToLast() {
    this._cursorIndex = Math.max(0, this.buttonConfigs.length - 1);
    this.refreshVisuals();
  }

  executeCursor() {
    const btn = this.buttonConfigs[this._cursorIndex];
    if (btn) this.emit('action', btn.key);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private clearButtons() {
    this.buttonBgs.forEach(b => b.destroy());
    this.buttonTexts.forEach(t => t.destroy());
    this.buttonBorders.forEach(g => g.destroy());
    this.buttonBgs = [];
    this.buttonTexts = [];
    this.buttonBorders = [];
  }

  private buildButtons() {
    const textStyle = {
      fontFamily: FONT.FAMILY,
      fontSize: FONT.SIZE,
      color: '#' + COLORS.TEXT_BUTTON.toString(16).padStart(6, '0'),
    };
    const midY = Math.floor(BUTTON_BAR_HEIGHT / 2);

    // Build right-to-left, then reverse so indices match buttonConfigs order
    const tmpBgs: Phaser.GameObjects.Rectangle[] = [];
    const tmpTexts: Phaser.GameObjects.Text[] = [];
    const tmpBorders: Phaser.GameObjects.Graphics[] = [];

    let rightX = this.barWidth - BUTTON_BAR_PADDING_RIGHT;

    for (let i = this.buttonConfigs.length - 1; i >= 0; i--) {
      const { label } = this.buttonConfigs[i];

      // Measure label width using temporary text
      const probe = this.scene.add.text(0, 0, label, textStyle);
      const btnW = probe.width + BUTTON_PADDING_X * 2;
      probe.destroy();

      const btnX = rightX - btnW;

      const bg = this.scene.add
        .rectangle(btnX, midY, btnW, BUTTON_HEIGHT, COLORS.BUTTON_BG)
        .setOrigin(0, 0.5)
        .setInteractive({ cursor: 'pointer' });

      const border = this.scene.add.graphics();

      const text = this.scene.add
        .text(btnX + BUTTON_PADDING_X, midY, label, textStyle)
        .setOrigin(0, 0.5);

      const idx = i; // capture for closure
      bg.on('pointerover', () => {
        this._cursorIndex = idx;
        this.refreshVisuals();
      });
      bg.on('pointerdown', () => {
        this._cursorIndex = idx;
        this.executeCursor();
      });

      this.add(bg);
      this.add(border);
      this.add(text);

      tmpBgs.unshift(bg);
      tmpTexts.unshift(text);
      tmpBorders.unshift(border);

      rightX -= btnW + BUTTON_GAP;
    }

    this.buttonBgs = tmpBgs;
    this.buttonTexts = tmpTexts;
    this.buttonBorders = tmpBorders;
    this.refreshVisuals();
  }

  private refreshVisuals() {
    this.buttonBorders.forEach((border, i) => {
      border.clear();
      if (this._hasFocus && i === this._cursorIndex) {
        const bg = this.buttonBgs[i];
        const x = bg.x;
        const y = bg.y - bg.height / 2;
        border.lineStyle(1, COLORS.BUTTON_FOCUSED_BORDER, 1);
        border.strokeRect(x, y, bg.width, bg.height);
      }
    });
  }
}
