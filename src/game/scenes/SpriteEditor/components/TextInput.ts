import Phaser from 'phaser';
import { COLORS, FONT, TEXT_INPUT_HEIGHT } from '../constants';

export type TextInputVariant = 'standalone' | 'labeled';

export interface TextInputConfig {
  x: number;
  y: number;
  width: number;
  height?: number;
  variant?: TextInputVariant;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  maxLength?: number;
}

/**
 * Pure-Phaser text input component.
 * Variants:
 *   - standalone: just an input box (used in LibraryScreen name field)
 *   - labeled:    "Label  [________]" (used in SpriteEditScreen name field)
 *
 * Events emitted:
 *   'confirm'  – Enter pressed; value committed
 *   'cancel'   – Esc pressed; draft discarded
 *   'nav-up'   – Up arrow while focused
 *   'nav-down' – Down arrow / Enter while focused
 *   'focus'    – gained focus
 *   'blur'     – lost focus
 */
export class TextInput extends Phaser.GameObjects.Container {
  private bg!: Phaser.GameObjects.Rectangle;
  private borderGfx!: Phaser.GameObjects.Graphics;
  private textDisplay!: Phaser.GameObjects.Text;
  private placeholderObj!: Phaser.GameObjects.Text;
  private cursorObj!: Phaser.GameObjects.Text;
  private labelObj?: Phaser.GameObjects.Text;

  private _value = '';
  private _draft = '';
  private _cursorPos = 0;
  private _isFocused = false;

  private readonly inputOffsetX: number;
  private readonly inputW: number;
  private readonly inputH: number;
  private readonly placeholder: string;
  private readonly maxLength: number;

  private cursorTween?: Phaser.Tweens.Tween;
  private keydownListener?: (event: KeyboardEvent) => void;

  constructor(scene: Phaser.Scene, config: TextInputConfig) {
    super(scene, config.x, config.y);

    const h = config.height ?? TEXT_INPUT_HEIGHT;
    const variant = config.variant ?? 'standalone';
    const label = config.label ?? '';
    this.placeholder = config.placeholder ?? '';
    this.maxLength = config.maxLength ?? 64;
    this.inputH = h;
    this._value = config.initialValue ?? '';
    this._draft = this._value;

    let labelW = 0;
    if (variant === 'labeled' && label) {
      this.labelObj = scene.add.text(0, Math.floor(h / 2), label, {
        fontFamily: FONT.FAMILY,
        fontSize: FONT.SIZE,
        color: this.toHex(COLORS.TEXT),
      }).setOrigin(0, 0.5);
      this.add(this.labelObj);
      labelW = this.labelObj.width + 4;
    }

    this.inputOffsetX = labelW;
    this.inputW = config.width - labelW;

    // Background
    this.bg = scene.add
      .rectangle(this.inputOffsetX, 0, this.inputW, h, COLORS.INPUT_BG)
      .setOrigin(0, 0)
      .setInteractive({ cursor: 'text' });
    this.add(this.bg);

    // Border (drawn with Graphics so we can stroke it)
    this.borderGfx = scene.add.graphics();
    this.add(this.borderGfx);
    this.drawBorder(false);

    // Placeholder
    this.placeholderObj = scene.add.text(
      this.inputOffsetX + 4,
      Math.floor(h / 2),
      this.placeholder,
      { fontFamily: FONT.FAMILY, fontSize: FONT.SIZE, color: this.toHex(COLORS.TEXT_PLACEHOLDER) }
    ).setOrigin(0, 0.5);
    this.add(this.placeholderObj);

    // Text display
    this.textDisplay = scene.add.text(
      this.inputOffsetX + 4,
      Math.floor(h / 2),
      '',
      { fontFamily: FONT.FAMILY, fontSize: FONT.SIZE, color: this.toHex(COLORS.TEXT) }
    ).setOrigin(0, 0.5);
    this.add(this.textDisplay);

    // Cursor bar
    this.cursorObj = scene.add.text(
      this.inputOffsetX + 4,
      Math.floor(h / 2),
      '|',
      { fontFamily: FONT.FAMILY, fontSize: FONT.SIZE, color: this.toHex(COLORS.TEXT) }
    ).setOrigin(0, 0.5).setVisible(false);
    this.add(this.cursorObj);

    // Click to focus
    this.bg.on('pointerdown', () => this.focus());

    scene.add.existing(this);
    this.refresh();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get isFocused() { return this._isFocused; }
  get value() { return this._value; }

  focus() {
    if (this._isFocused) return;
    this._isFocused = true;
    this._draft = this._value;
    this._cursorPos = this._draft.length;
    this.drawBorder(true);
    this.refresh();

    this.cursorObj.setVisible(true).setAlpha(1);
    this.cursorTween = this.scene.tweens.add({
      targets: this.cursorObj,
      alpha: 0,
      duration: 400,
      yoyo: true,
      repeat: -1,
    });

    this.keydownListener = (e: KeyboardEvent) => {
      if (!this._isFocused) return;
      e.preventDefault();
      this.handleKey(e);
    };
    this.scene.input.keyboard!.on('keydown', this.keydownListener);
    this.emit('focus');
  }

  blur() {
    if (!this._isFocused) return;
    this._isFocused = false;
    this.drawBorder(false);
    this.cursorObj.setVisible(false);
    this.cursorTween?.stop();
    this.cursorTween = undefined;
    this.cursorObj.setAlpha(1);

    if (this.keydownListener) {
      this.scene.input.keyboard!.off('keydown', this.keydownListener);
      this.keydownListener = undefined;
    }
    this.refresh();
    this.emit('blur');
  }

  setValue(v: string) {
    this._value = v;
    this._draft = v;
    this._cursorPos = v.length;
    this.refresh();
  }

  /** Show/hide the focused border when the field cursor is on this input but not actively typing. */
  setFieldHighlight(on: boolean) {
    if (!this._isFocused) this.drawBorder(on);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private toHex(n: number): string {
    return '#' + n.toString(16).padStart(6, '0');
  }

  private drawBorder(focused: boolean) {
    this.borderGfx.clear();
    const color = focused ? COLORS.INPUT_BORDER_FOCUSED : COLORS.INPUT_BORDER_DEFAULT;
    this.borderGfx.lineStyle(1, color, 1);
    this.borderGfx.strokeRect(this.inputOffsetX, 0, this.inputW, this.inputH);
  }

  private handleKey(event: KeyboardEvent) {
    const key = event.key;

    switch (key) {
      case 'Enter':
        this._value = this._draft;
        this.blur();
        this.emit('confirm', this._value);
        this.emit('nav-down');
        return;

      case 'Escape':
        this._draft = this._value;
        this._cursorPos = this._value.length;
        this.blur();
        this.emit('cancel');
        this.emit('nav-down');
        return;

      case 'ArrowLeft':
        this._cursorPos = Math.max(0, this._cursorPos - 1);
        this.refresh();
        return;

      case 'ArrowRight':
        this._cursorPos = Math.min(this._draft.length, this._cursorPos + 1);
        this.refresh();
        return;

      case 'ArrowUp':
        this.blur();
        this.emit('nav-up');
        return;

      case 'ArrowDown':
        this._value = this._draft;
        this.blur();
        this.emit('nav-down');
        return;

      case 'Backspace':
        if (this._cursorPos > 0) {
          this._draft =
            this._draft.slice(0, this._cursorPos - 1) +
            this._draft.slice(this._cursorPos);
          this._cursorPos--;
          this.refresh();
        }
        return;
    }

    // Printable ASCII (letters, digits, underscore, hyphen, space)
    if (key.length === 1 && /^[a-zA-Z0-9_\- ]$/.test(key)) {
      if (this._draft.length < this.maxLength) {
        this._draft =
          this._draft.slice(0, this._cursorPos) +
          key +
          this._draft.slice(this._cursorPos);
        this._cursorPos++;
        this.refresh();
      }
    }
  }

  /** Update display text and cursor position */
  private refresh() {
    const displayText = this._isFocused ? this._draft : this._value;
    this.textDisplay.setText(displayText);
    this.placeholderObj.setVisible(!this._isFocused && displayText.length === 0);

    if (this._isFocused) {
      // Measure width of text before cursor by temporarily setting text
      const before = this._draft.slice(0, this._cursorPos);
      this.textDisplay.setText(before);
      const cursorX = this.inputOffsetX + 4 + this.textDisplay.width;
      this.textDisplay.setText(displayText);
      this.cursorObj.setX(cursorX);
    }
  }

  destroy(fromScene?: boolean) {
    this.blur();
    super.destroy(fromScene);
  }
}
