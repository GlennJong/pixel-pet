import Phaser from 'phaser';
import { NumberInput } from './NumberInput';
import {
  COLORS, FONT,
  CARD_HEIGHT, CARD_PAD_X, CARD_PAD_Y, PREVIEW_SIZE,
  CARD_FIELD_GAP,
  NUMBER_INPUT_HEIGHT,
  NUMBER_INPUT_TRACK_WIDTH,
  hex,
} from '../constants';
import { SpriteData, ImageItem } from '../types';
import { fitContainNoUpscale } from '../utils/sizing';

export type CardField = 'selectFrames' | 'freq' | 'repeat' | 'repeatDelay' | 'copy' | 'delete';
export const CARD_FIELDS: CardField[] = ['selectFrames', 'freq', 'repeat', 'repeatDelay', 'copy', 'delete'];

/**
 * A sprite configuration card for S2 (SpriteEditScreen).
 *
 * The sprite name (prefix) is auto-assigned (a number string) and shown as a
 * read-only label — there is no name input, so it isn't a navigable field.
 *
 * Layout (within a card of `width` × CARD_HEIGHT), config column top → bottom:
 *   FRAMES, FPS, REPEAT, DELAY, COPY, DELETE (preview thumbnail to the left).
 *
 * Events emitted:
 *   'hover'             – mouse entered card body (card-mode cursor)
 *   'hover-field' (CardField) – mouse entered a specific field
 *   'activate' (CardField)    – mouse clicked a specific field
 *   'go-to-frames'      – SELECT FRAMES was activated (go to S3)
 *   'copy'              – COPY was activated (duplicate this sprite)
 *   'delete'            – DELETE was activated
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
  private previewPlaceholder!: Phaser.GameObjects.Text;
  private previewSprite?: Phaser.GameObjects.Sprite;
  private freqInput!: NumberInput;
  private repeatInput!: NumberInput;
  private repeatDelayInput!: NumberInput;
  private selectFramesBtnBg!: Phaser.GameObjects.Rectangle;
  private selectFramesBtnText!: Phaser.GameObjects.Text;
  private copyBtnBg!: Phaser.GameObjects.Rectangle;
  private copyBtnText!: Phaser.GameObjects.Text;
  private deleteBtnBg!: Phaser.GameObjects.Rectangle;
  private deleteBtnText!: Phaser.GameObjects.Text;
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
    this.previewSize = PREVIEW_SIZE;
    this.configX = CARD_PAD_X + this.previewSize + CARD_PAD_X; // e.g. 52
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
    // No editable text on the card anymore (name is an auto-assigned label).
    return false;
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
      case 'selectFrames': this.emit('go-to-frames'); break;
      case 'copy':    this.emit('copy');         break;
      case 'delete':  this.emit('delete');       break;
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
    this.selectFramesBtnText.setText(this.framesLabel());
    this.rebuildAnimation();
    this.emit('change', this.collectData());
  }

  /** Button label showing the current frame count, e.g. "FRAMES:5". */
  private framesLabel(): string {
    return `FRAMES:${this._spriteData.frames.length}`;
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
    this.cardBg.on('pointerdown', () => this.emit('activate', CARD_FIELDS[0]));
    this.add(this.cardBg);

    this.cardBorder = this.scene.add.graphics();
    this.add(this.cardBorder);

    // ── Preview area (non-interactive thumbnail; frames are chosen via the
    // SELECT FRAMES button below) ────────────────────────────────────────────
    this.previewBg = this.scene.add
      .rectangle(CARD_PAD_X, CARD_PAD_Y, this.previewSize, this.previewSize, COLORS.PREVIEW_BG)
      .setOrigin(0, 0);
    this.add(this.previewBg);

    this.previewPlaceholder = this.scene.add
      .text(
        CARD_PAD_X + this.previewSize / 2,
        CARD_PAD_Y + this.previewSize / 2,
        'preview',
        {
          fontFamily: FONT.FAMILY,
          fontSize: FONT.SIZE,
          color: hex(COLORS.TEXT_LIGHT),
        },
      )
      .setOrigin(0.5);
    this.add(this.previewPlaceholder);

    // ── Config fields (top → bottom): frames, FPS, repeat, delay, copy, delete ──
    const rowH = NUMBER_INPUT_HEIGHT;
    const selectFramesY = CARD_PAD_Y;
    const freqY         = selectFramesY + rowH + CARD_FIELD_GAP;
    const repeatY       = freqY + rowH + CARD_FIELD_GAP;
    const repeatDelayY  = repeatY + rowH + CARD_FIELD_GAP;
    const copyY         = repeatDelayY + rowH + CARD_FIELD_GAP;
    const deleteY       = copyY + rowH + CARD_FIELD_GAP;

    // ── Select-frames button ────────────────────────────────────────────────────
    this.selectFramesBtnBg = this.scene.add
      .rectangle(this.configX, selectFramesY, this.configW, NUMBER_INPUT_HEIGHT, COLORS.X_BTN_BG)
      .setOrigin(0, 0)
      .setInteractive({ cursor: 'pointer' });
    this.selectFramesBtnBg.on('pointerover', () => this.emit('hover-field', 'selectFrames'));
    this.selectFramesBtnBg.on('pointerdown', () => this.emit('activate', 'selectFrames'));
    this.add(this.selectFramesBtnBg);

    this.selectFramesBtnText = this.scene.add
      .text(
        this.configX,
        selectFramesY,
        this.framesLabel(),
        {
          fontFamily: FONT.FAMILY,
          fontSize: FONT.SIZE,
          color: hex(COLORS.X_BTN_TEXT),
          resolution: 1,
        },
      )
      .setOrigin(0, 0);
    this.add(this.selectFramesBtnText);

    this.freqInput = new NumberInput(this.scene, {
      x: this.configX, y: freqY,
      label: 'FPS', value: this._spriteData.freq,
      min: 1, max: 60, step: 1,
      trackWidth: NUMBER_INPUT_TRACK_WIDTH,
    });
    this.freqInput.on('change', () => this.syncDataAndAnimation());
    this.add(this.freqInput);

    this.repeatInput = new NumberInput(this.scene, {
      x: this.configX, y: repeatY,
      label: 'REPEAT', value: this._spriteData.repeat,
      min: -1, max: 5, step: 1,
      trackWidth: NUMBER_INPUT_TRACK_WIDTH,
    });
    this.repeatInput.on('change', () => this.syncDataAndAnimation());
    this.add(this.repeatInput);

    this.repeatDelayInput = new NumberInput(this.scene, {
      x: this.configX, y: repeatDelayY,
      label: 'DELAY', value: this._spriteData.repeatDelay,
      min: 0, max: 5000, step: 50,
      trackWidth: NUMBER_INPUT_TRACK_WIDTH,
    });
    this.repeatDelayInput.on('change', () => this.syncDataAndAnimation());
    this.add(this.repeatDelayInput);

    // ── Copy button ─────────────────────────────────────────────────────────────
    this.copyBtnBg = this.scene.add
      .rectangle(this.configX, copyY, this.configW, NUMBER_INPUT_HEIGHT, COLORS.X_BTN_BG)
      .setOrigin(0, 0)
      .setInteractive({ cursor: 'pointer' });
    this.copyBtnBg.on('pointerover', () => this.emit('hover-field', 'copy'));
    this.copyBtnBg.on('pointerdown', () => this.emit('activate', 'copy'));
    this.add(this.copyBtnBg);

    this.copyBtnText = this.scene.add
      .text(this.configX, copyY, 'COPY', {
        fontFamily: FONT.FAMILY,
        fontSize: FONT.SIZE,
        color: hex(COLORS.X_BTN_TEXT),
        resolution: 1,
      })
      .setOrigin(0, 0);
    this.add(this.copyBtnText);

    // ── Delete button ─────────────────────────────────────────────────────────
    this.deleteBtnBg = this.scene.add
      .rectangle(this.configX, deleteY, this.configW, NUMBER_INPUT_HEIGHT, COLORS.X_BTN_BG)
      .setOrigin(0, 0)
      .setInteractive({ cursor: 'pointer' });
    this.deleteBtnBg.on('pointerover', () => this.emit('hover-field', 'delete'));
    this.deleteBtnBg.on('pointerdown', () => this.emit('activate', 'delete'));
    this.add(this.deleteBtnBg);

    this.deleteBtnText = this.scene.add
      .text(
        this.configX,
        deleteY,
        'DELETE',
        {
          fontFamily: FONT.FAMILY,
          fontSize: FONT.SIZE,
          color: hex(COLORS.X_BTN_TEXT),
          resolution: 1,
        },
      )
      .setOrigin(0, 0);
    this.add(this.deleteBtnText);

    // Mouse overlays for the NumberInput rows (hover/click without blocking them).
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

    // NumberInput visual focus
    this._focusedField === 'freq'        ? this.freqInput.focus()        : this.freqInput.blur();
    this._focusedField === 'repeat'      ? this.repeatInput.focus()      : this.repeatInput.blur();
    this._focusedField === 'repeatDelay' ? this.repeatDelayInput.focus() : this.repeatDelayInput.blur();

    // Select-frames button focus highlight
    const selectFramesFocused = this._focusedField === 'selectFrames';
    this.selectFramesBtnBg.setFillStyle(selectFramesFocused ? COLORS.X_BTN_FOCUSED_BG : COLORS.X_BTN_BG);
    this.selectFramesBtnText.setColor(hex(selectFramesFocused ? COLORS.X_BTN_TEXT_FOCUSED : COLORS.X_BTN_TEXT));

    // Copy button focus highlight
    const copyFocused = this._focusedField === 'copy';
    this.copyBtnBg.setFillStyle(copyFocused ? COLORS.X_BTN_FOCUSED_BG : COLORS.X_BTN_BG);
    this.copyBtnText.setColor(hex(copyFocused ? COLORS.X_BTN_TEXT_FOCUSED : COLORS.X_BTN_TEXT));

    // Delete button focus highlight
    const deleteFocused = this._focusedField === 'delete';
    this.deleteBtnBg.setFillStyle(deleteFocused ? COLORS.X_BTN_FOCUSED_BG : COLORS.X_BTN_BG);
    this.deleteBtnText.setColor(hex(deleteFocused ? COLORS.X_BTN_TEXT_FOCUSED : COLORS.X_BTN_TEXT));
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
