import Phaser from 'phaser';
import { COLORS, FONT, NUMBER_INPUT_HEIGHT, NUMBER_INPUT_TRACK_WIDTH } from '../constants';

export interface NumberInputConfig {
  x: number;
  y: number;
  label: string;
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  trackWidth?: number;
}

/**
 * Labeled number field with a horizontal slider.
 * Layout: [label]  [value]  [track────thumb────]
 *
 * In focused state Left/Right keys adjust the value directly (handled
 * externally by the parent screen in Field mode).
 *
 * Events emitted:
 *   'change' (value: number) – value was incremented or decremented
 *   'focus'
 *   'blur'
 */
export class NumberInput extends Phaser.GameObjects.Container {
  private labelText!: Phaser.GameObjects.Text;
  private valueText!: Phaser.GameObjects.Text;
  private track!: Phaser.GameObjects.Rectangle;
  private thumb!: Phaser.GameObjects.Rectangle;
  private borderGfx!: Phaser.GameObjects.Graphics;

  private _value: number;
  private _isFocused = false;
  private _isEditActive = false;

  private readonly min: number;
  private readonly max: number;
  private readonly step: number;
  private readonly trackWidth: number;
  private readonly trackStartX: number;

  constructor(scene: Phaser.Scene, config: NumberInputConfig) {
    super(scene, config.x, config.y);

    this.min = config.min ?? 0;
    this.max = config.max ?? 100;
    this.step = config.step ?? 1;
    this._value = config.value ?? this.min;
    this.trackWidth = config.trackWidth ?? NUMBER_INPUT_TRACK_WIDTH;

    const midY = Math.floor(NUMBER_INPUT_HEIGHT / 2);
    const dimColor = '#' + COLORS.TEXT_LIGHT.toString(16).padStart(6, '0');

    // Label
    this.labelText = scene.add.text(0, midY, config.label, {
      fontFamily: FONT.FAMILY,
      fontSize: FONT.SIZE,
      color: dimColor,
    }).setOrigin(0, 0.5);
    this.add(this.labelText);

    // Value text (fixed-width column: right of label)
    const valX = this.labelText.width + 8;
    this.valueText = scene.add.text(valX, midY, this.formatValue(), {
      fontFamily: FONT.FAMILY,
      fontSize: FONT.SIZE,
      color: dimColor,
    }).setOrigin(0, 0.5);
    this.add(this.valueText);

    // Slider track
    this.trackStartX = valX + 30;
    this.track = scene.add
      .rectangle(this.trackStartX, midY, this.trackWidth, 3, COLORS.SLIDER_TRACK)
      .setOrigin(0, 0.5);
    this.add(this.track);

    // Slider thumb
    this.thumb = scene.add
      .rectangle(this.trackStartX, midY, 4, 10, COLORS.SLIDER_THUMB)
      .setOrigin(0.5, 0.5);
    this.add(this.thumb);

    // Focus border
    this.borderGfx = scene.add.graphics();
    this.add(this.borderGfx);

    scene.add.existing(this);
    this.updateThumb();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get value() { return this._value; }
  get isFocused() { return this._isFocused; }

  focus() {
    if (this._isFocused) return;
    this._isFocused = true;
    this.refreshVisuals();
    this.emit('focus');
  }

  blur() {
    if (!this._isFocused) return;
    this._isFocused = false;
    this._isEditActive = false;
    this.refreshVisuals();
    this.emit('blur');
  }

  increment() {
    this._value = Math.min(this.max, this._value + this.step);
    this.updateDisplay();
    this.emit('change', this._value);
  }

  decrement() {
    this._value = Math.max(this.min, this._value - this.step);
    this.updateDisplay();
    this.emit('change', this._value);
  }

  setValue(v: number) {
    this._value = Phaser.Math.Clamp(v, this.min, this.max);
    this.updateDisplay();
  }

  /** Enter value-edit mode (Left/Right will adjust the value). */
  activateEdit() {
    if (!this._isFocused || this._isEditActive) return;
    this._isEditActive = true;
    this.refreshVisuals();
  }

  /** Exit value-edit mode. */
  deactivateEdit() {
    if (!this._isEditActive) return;
    this._isEditActive = false;
    this.refreshVisuals();
  }

  get isEditActive() { return this._isEditActive; }

  // ── Private ────────────────────────────────────────────────────────────────

  private formatValue(): string {
    return String(this._value);
  }

  private updateDisplay() {
    this.valueText.setText(this.formatValue());
    this.updateThumb();
  }

  private updateThumb() {
    const ratio = this.max === this.min
      ? 0
      : (this._value - this.min) / (this.max - this.min);
    this.thumb.setX(this.trackStartX + ratio * this.trackWidth);
  }

  private refreshVisuals() {
    const bright = '#' + COLORS.TEXT.toString(16).padStart(6, '0');
    const dim = '#' + COLORS.TEXT_LIGHT.toString(16).padStart(6, '0');
    const color = this._isFocused ? bright : dim;
    this.labelText.setStyle({ color });
    this.valueText.setStyle({ color });
    this.thumb.setFillStyle(this._isFocused ? COLORS.SLIDER_THUMB_FOCUSED : COLORS.SLIDER_THUMB);
    this.borderGfx.clear();
    if (this._isFocused) {
      this.borderGfx.lineStyle(this._isEditActive ? 2 : 1, COLORS.INPUT_BORDER_FOCUSED, 1);
      this.borderGfx.strokeRect(0, 0, this.trackStartX + this.trackWidth, NUMBER_INPUT_HEIGHT);
    }
  }
}
