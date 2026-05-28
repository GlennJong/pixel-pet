import Phaser from 'phaser';
import { TextInput } from './TextInput';
import { NumberInput } from './NumberInput';
import {
  COLORS, FONT,
  CARD_HEIGHT, CARD_PAD_X, CARD_PAD_Y,
  CARD_FIELD_GAP,
  NUMBER_INPUT_HEIGHT, TEXT_INPUT_HEIGHT,
  NUMBER_INPUT_TRACK_WIDTH,
} from '../constants';
import { SpriteData, ImageItem } from '../types';
import { fitContainNoUpscale } from '../utils/sizing';

export type CardField = 'preview' | 'name' | 'freq' | 'repeat' | 'repeatDelay';
export const CARD_FIELDS: CardField[] = ['preview', 'name', 'freq', 'repeat', 'repeatDelay'];

/**
 * A sprite configuration card for S2 (SpriteEditScreen).
 *
 * Layout (within a card of `width` × CARD_HEIGHT):
 *   [preview area] [name TextInput] [freq/repeat/repeatDelay NumberInput×3] [X btn]
 *
 * Events emitted:
 *   'hover'             – mouse entered card body (card-mode cursor)
 *   'hover-field' (CardField) – mouse entered a specific field
 *   'activate' (CardField)    – mouse clicked a specific field
 *   'go-to-frames'      – preview was activated (go to S3)
 *   'delete'            – X button was activated
 *   'change' (SpriteData)     – any config value changed
 */
export class SpriteCard extends Phaser.GameObjects.Container {
  public readonly spriteId: string;
  private _spriteData: SpriteData;
  private _images: ImageItem[];

  // Layout (computed from width in ctor)
  private readonly previewSize: number;
  private readonly configX: number;
  private readonly configW: number;

  // UI
  private cardBg!: Phaser.GameObjects.Rectangle;
  private cardBorder!: Phaser.GameObjects.Graphics;
  private previewBg!: Phaser.GameObjects.Rectangle;
  private previewFocusOverlay!: Phaser.GameObjects.Graphics;
  private previewPlaceholder!: Phaser.GameObjects.Text;
  private previewSprite?: Phaser.GameObjects.Sprite;
  private nameInput!: TextInput;
  private freqInput!: NumberInput;
  private repeatInput!: NumberInput;
  private repeatDelayInput!: NumberInput;
  private selectOverlay!: Phaser.GameObjects.Graphics;

  // State
  private _focusedField: CardField | null = null;
  private _isCardFocused = false;
  private _previewPlaybackEnabled = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    spriteData: SpriteData,
    images: ImageItem[],
  ) {
    super(scene, x, y);
    this.spriteId = spriteData.id;
    this._spriteData = { ...spriteData };
    this._images = images;

    // Compute layout constants
    this.previewSize = CARD_HEIGHT - CARD_PAD_Y * 2;           // 68 at defaults
    this.configX = CARD_PAD_X + this.previewSize + CARD_PAD_X; // e.g. 80
    this.configW = width - CARD_PAD_X - this.configX;

    this.buildUI(width);
    scene.add.existing(this);
    this.rebuildAnimation();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  get spriteData(): SpriteData {
    return this.collectData();
  }

  get isTextInputActive(): boolean {
    return this.nameInput.isFocused;
  }

  get focusedField(): CardField | null {
    return this._focusedField;
  }

  setCardFocus(focused: boolean) {
    this._isCardFocused = focused;
    this.refreshVisuals();
  }

  setFieldFocus(field: CardField | null) {
    this._focusedField = field;
    this.deactivateNumberEdit();
    this.refreshVisuals();
  }

  /** Enable/disable preview animation playback for this card. */
  setPreviewPlayback(enabled: boolean) {
    if (this._previewPlaybackEnabled === enabled) return;
    this._previewPlaybackEnabled = enabled;
    this.applyPreviewPlayback(true);
  }

  /** Show/hide the multi-select highlight (select mode). */
  setSelectState(selected: boolean) {
    this.selectOverlay.clear();
    if (selected) {
      this.selectOverlay.fillStyle(COLORS.CELL_SELECTED_BG, 0.4);
      this.selectOverlay.fillRect(0, 0, this.cardBg.width, CARD_HEIGHT);
      this.selectOverlay.lineStyle(2, COLORS.CELL_SELECTED_BORDER, 1);
      this.selectOverlay.strokeRect(0, 0, this.cardBg.width, CARD_HEIGHT);
    }
  }

  /** Space handler for the currently focused field. */
  activateCurrentField() {
    switch (this._focusedField) {
      case 'preview': this.emit('go-to-frames'); break;
      case 'name':    this.nameInput.focus();    break;
      // NumberInput fields: Left/Right handled externally
    }
  }

  incrementField() {
    if (this._focusedField === 'freq')        { this.freqInput.increment();        this.syncDataAndAnimation(); }
    else if (this._focusedField === 'repeat') { this.repeatInput.increment();      this.syncDataAndAnimation(); }
    else if (this._focusedField === 'repeatDelay') { this.repeatDelayInput.increment(); this.syncDataAndAnimation(); }
  }

  decrementField() {
    if (this._focusedField === 'freq')        { this.freqInput.decrement();        this.syncDataAndAnimation(); }
    else if (this._focusedField === 'repeat') { this.repeatInput.decrement();      this.syncDataAndAnimation(); }
    else if (this._focusedField === 'repeatDelay') { this.repeatDelayInput.decrement(); this.syncDataAndAnimation(); }
  }

  /** Enter value-edit mode on the currently focused number field. */
  activateNumberEdit() {
    if (this._focusedField === 'freq')            this.freqInput.activateEdit();
    else if (this._focusedField === 'repeat')      this.repeatInput.activateEdit();
    else if (this._focusedField === 'repeatDelay') this.repeatDelayInput.activateEdit();
  }

  /** Exit value-edit mode on all number fields. */
  deactivateNumberEdit() {
    this.freqInput.deactivateEdit();
    this.repeatInput.deactivateEdit();
    this.repeatDelayInput.deactivateEdit();
  }

  get isNumberEditActive(): boolean {
    return this.freqInput.isEditActive || this.repeatInput.isEditActive || this.repeatDelayInput.isEditActive;
  }

  /** Apply confirmed frame IDs from S3. */
  setFrames(frameIds: string[]) {
    this._spriteData = { ...this._spriteData, frames: frameIds };
    this.rebuildAnimation();
    this.emit('change', this.collectData());
  }

  /** Update the image pool (e.g. after returning from S1 with purged images). */
  setImages(images: ImageItem[]) {
    this._images = images;
  }

  // ── Build ───────────────────────────────────────────────────────────────────

  private buildUI(width: number) {
    // Card background
    this.cardBg = this.scene.add
      .rectangle(0, 0, width, CARD_HEIGHT, COLORS.CARD_BG)
      .setOrigin(0, 0)
      .setInteractive({ cursor: 'pointer' });
    this.cardBg.on('pointerover', () => this.emit('hover'));
    this.cardBg.on('pointerdown', () => this.emit('activate', 'name'));
    this.add(this.cardBg);

    this.cardBorder = this.scene.add.graphics();
    this.add(this.cardBorder);

    // ── Preview area ──────────────────────────────────────────────────────────
    this.previewBg = this.scene.add
      .rectangle(CARD_PAD_X, CARD_PAD_Y, this.previewSize, this.previewSize, COLORS.PREVIEW_BG)
      .setOrigin(0, 0)
      .setInteractive({ cursor: 'pointer' });
    this.previewBg.on('pointerover', () => this.emit('hover-field', 'preview'));
    this.previewBg.on('pointerdown', () => this.emit('activate', 'preview'));
    this.add(this.previewBg);

    this.previewFocusOverlay = this.scene.add.graphics();
    this.add(this.previewFocusOverlay);

    this.previewPlaceholder = this.scene.add
      .text(
        CARD_PAD_X + this.previewSize / 2,
        CARD_PAD_Y + this.previewSize / 2,
        'preview',
        {
          fontFamily: FONT.FAMILY,
          fontSize: FONT.SIZE_SM,
          color: '#' + COLORS.TEXT_LIGHT.toString(16).padStart(6, '0'),
        },
      )
      .setOrigin(0.5);
    this.add(this.previewPlaceholder);

    // ── Config fields ─────────────────────────────────────────────────────────
    const nameY       = CARD_PAD_Y;
    const freqY       = nameY + TEXT_INPUT_HEIGHT + CARD_FIELD_GAP;
    const repeatY     = freqY + NUMBER_INPUT_HEIGHT + CARD_FIELD_GAP;
    const repeatDelayY = repeatY + NUMBER_INPUT_HEIGHT + CARD_FIELD_GAP;

    this.nameInput = new TextInput(this.scene, {
      x: this.configX,
      y: nameY,
      width: this.configW,
      height: TEXT_INPUT_HEIGHT,
      variant: 'labeled',
      label: 'n',
      placeholder: 'sprite name',
      initialValue: this._spriteData.prefix,
    });
    this.nameInput.on('confirm', () => {
      this._spriteData = { ...this._spriteData, prefix: this.nameInput.value };
      this.emit('change', this.collectData());
      this.emit('field-committed');
    });
    this.nameInput.on('cancel', () => this.emit('field-committed'));
    this.nameInput.on('blur', () => this.refreshVisuals());
    this.add(this.nameInput);

    this.freqInput = new NumberInput(this.scene, {
      x: this.configX, y: freqY,
      label: 'f', value: this._spriteData.freq,
      min: 1, max: 60, step: 1,
      trackWidth: NUMBER_INPUT_TRACK_WIDTH,
    });
    this.freqInput.on('change', () => this.syncDataAndAnimation());
    this.add(this.freqInput);

    this.repeatInput = new NumberInput(this.scene, {
      x: this.configX, y: repeatY,
      label: 'r', value: this._spriteData.repeat,
      min: -1, max: 99, step: 1,
      trackWidth: NUMBER_INPUT_TRACK_WIDTH,
    });
    this.repeatInput.on('change', () => this.syncDataAndAnimation());
    this.add(this.repeatInput);

    this.repeatDelayInput = new NumberInput(this.scene, {
      x: this.configX, y: repeatDelayY,
      label: 'd', value: this._spriteData.repeatDelay,
      min: 0, max: 5000, step: 50,
      trackWidth: NUMBER_INPUT_TRACK_WIDTH,
    });
    this.repeatDelayInput.on('change', () => this.syncDataAndAnimation());
    this.add(this.repeatDelayInput);

    // Mouse overlays for NumberInput and name rows (allow hover/click without blocking TextInput)
    [
      { y: freqY, h: NUMBER_INPUT_HEIGHT, field: 'freq' as CardField },
      { y: repeatY, h: NUMBER_INPUT_HEIGHT, field: 'repeat' as CardField },
      { y: repeatDelayY, h: NUMBER_INPUT_HEIGHT, field: 'repeatDelay' as CardField },
    ].forEach(({ y, h, field }) => {
      const ov = this.scene.add
        .rectangle(this.configX, y, this.configW, h, 0, 0)
        .setOrigin(0, 0)
        .setInteractive({ cursor: 'pointer' });
      ov.on('pointerover', () => this.emit('hover-field', field));
      ov.on('pointerdown', () => this.emit('activate', field));
      this.add(ov);
    });

    const nameOv = this.scene.add
      .rectangle(this.configX, nameY, this.configW, TEXT_INPUT_HEIGHT, 0, 0)
      .setOrigin(0, 0)
      .setInteractive({ cursor: 'pointer' });
    nameOv.on('pointerover', () => this.emit('hover-field', 'name'));
    nameOv.on('pointerdown', () => this.emit('activate', 'name'));
    this.add(nameOv);

    // Select-mode overlay (drawn on top of everything)
    this.selectOverlay = this.scene.add.graphics();
    this.add(this.selectOverlay);
  }

  // ── Refresh visuals ─────────────────────────────────────────────────────────

  private refreshVisuals() {
    // Card border (card mode focus)
    this.cardBorder.clear();
    if (this._isCardFocused) {
      this.cardBorder.lineStyle(2, COLORS.CARD_FOCUSED_BORDER, 1);
      this.cardBorder.strokeRect(0, 0, this.cardBg.width, CARD_HEIGHT);
    }

    // Preview focus border
    this.previewFocusOverlay.clear();
    if (this._focusedField === 'preview') {
      this.previewFocusOverlay.lineStyle(2, COLORS.PREVIEW_FOCUSED_BORDER, 1);
      this.previewFocusOverlay.strokeRect(CARD_PAD_X, CARD_PAD_Y, this.previewSize, this.previewSize);
    }

    // Name field highlight (field cursor without active typing)
    this.nameInput.setFieldHighlight(this._focusedField === 'name');

    // NumberInput visual focus
    this._focusedField === 'freq'        ? this.freqInput.focus()        : this.freqInput.blur();
    this._focusedField === 'repeat'      ? this.repeatInput.focus()      : this.repeatInput.blur();
    this._focusedField === 'repeatDelay' ? this.repeatDelayInput.focus() : this.repeatDelayInput.blur();
  }

  // ── Animation preview ───────────────────────────────────────────────────────

  private syncDataAndAnimation() {
    this._spriteData = {
      ...this._spriteData,
      freq: this.freqInput.value,
      repeat: this.repeatInput.value,
      repeatDelay: this.repeatDelayInput.value,
    };
    this.rebuildAnimation();
    this.emit('change', this.collectData());
  }

  private rebuildAnimation() {
    const { frames, freq, repeat, repeatDelay, id } = this._spriteData;
    const animKey = `editor_preview_${id}`;

    if (this.scene.anims.exists(animKey)) {
      this.previewSprite?.stop();
      this.scene.anims.remove(animKey);
    }

    if (frames.length === 0) {
      this.previewSprite?.setVisible(false);
      this.previewPlaceholder.setVisible(true);
      return;
    }

    const animFrames = frames
      .map(imgId => this._images.find(i => i.id === imgId))
      .filter((img): img is ImageItem => img !== undefined && this.scene.textures.exists(img.textureKey))
      .map(img => ({ key: img.textureKey }));

    if (animFrames.length === 0) {
      this.previewSprite?.setVisible(false);
      this.previewPlaceholder.setVisible(true);
      return;
    }

    const cx = CARD_PAD_X + Math.floor(this.previewSize / 2);
    const cy = CARD_PAD_Y + Math.floor(this.previewSize / 2);
    const maxPreviewSize = this.previewSize - 4;

    // Use largest frame dimensions so mixed-size animation frames remain
    // fully visible without cropping or per-frame scale jitter.
    let sourceW = 1;
    let sourceH = 1;
    frames.forEach(imgId => {
      const image = this._images.find(i => i.id === imgId);
      if (!image) return;
      sourceW = Math.max(sourceW, image.width);
      sourceH = Math.max(sourceH, image.height);
    });
    const fitted = fitContainNoUpscale(sourceW, sourceH, maxPreviewSize, maxPreviewSize);

    if (!this.previewSprite || !this.previewSprite.active) {
      this.previewSprite = this.scene.add
        .sprite(cx, cy, animFrames[0].key)
        .setOrigin(0.5)
        .setDisplaySize(fitted.width, fitted.height);
      this.add(this.previewSprite);
    } else {
      this.previewSprite
        .setTexture(animFrames[0].key)
        .setDisplaySize(fitted.width, fitted.height)
        .setVisible(true);
    }

    this.scene.anims.create({
      key: animKey,
      frames: animFrames,
      frameRate: Math.max(1, freq),
      repeat: repeat >= -1 ? repeat : -1,
      repeatDelay: repeatDelay > 0 ? repeatDelay : 0,
    });

    this.applyPreviewPlayback();
    this.previewPlaceholder.setVisible(false);
  }

  private applyPreviewPlayback(restart = false) {
    if (!this.previewSprite || !this.previewSprite.active) return;

    const animKey = `editor_preview_${this._spriteData.id}`;
    if (!this.scene.anims.exists(animKey)) return;

    if (this._previewPlaybackEnabled) {
      const isPlayingCurrent = this.previewSprite.anims.isPlaying
        && this.previewSprite.anims.currentAnim?.key === animKey;
      if (restart || !isPlayingCurrent) {
        this.previewSprite.play(animKey);
      }
      return;
    }

    this.previewSprite.stop();

    const firstFrameImageId = this._spriteData.frames[0];
    const firstFrameImage = this._images.find(
      image => image.id === firstFrameImageId && this.scene.textures.exists(image.textureKey),
    );
    if (firstFrameImage) {
      this.previewSprite.setTexture(firstFrameImage.textureKey);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private collectData(): SpriteData {
    return {
      ...this._spriteData,
      prefix: this.nameInput.value,
      freq: this.freqInput.value,
      repeat: this.repeatInput.value,
      repeatDelay: this.repeatDelayInput.value,
    };
  }

  destroy(fromScene?: boolean) {
    const animKey = `editor_preview_${this._spriteData.id}`;
    if (this.scene?.anims?.exists(animKey)) {
      this.scene.anims.remove(animKey);
    }
    super.destroy(fromScene);
  }
}
