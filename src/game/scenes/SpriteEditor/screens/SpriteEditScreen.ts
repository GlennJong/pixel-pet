import Phaser from 'phaser';
import {
  SpriteCard,
  CardField,
  CARD_FIELDS,
  ConfirmDialog,
  ScreenKeyboard,
} from '../elements';
import {
  COLORS,
  FONT,
  BUTTON_BAR_HEIGHT,
  CARD_HEIGHT, CARD_GAP, CARD_AREA_PAD,
  hex,
} from '../constants';
import { SpriteData, ImageItem } from '../types';

let _spriteIdCounter = 1;

// New sprites get an auto-assigned number string as their name (prefix); there
// is no name input. Import/preset sprites keep their own prefix.
const DEFAULT_SPRITE = (): SpriteData => {
  const n = _spriteIdCounter++;
  return {
    id: `sprite_${n}`,
    prefix: String(n),
    frames: [],
    freq: 8,
    repeat: -1,
    repeatDelay: 0,
  };
};

// 'add' focuses the "ADD SPRITE" row pinned after the last card. ADD/SELECT/
// APPLY/EXPORT used to live in a top operation bar; that bar was removed —
// adding is the ADD row, apply/export live in the scene nav's SAVE menu, and
// bulk select was dropped (delete is per-card).
type EditMode = 'card' | 'field' | 'add';

// "ADD SPRITE" row: a full-width button that rides at the bottom of the
// scrolling column, in the slot where the next card would appear.
const ADD_ROW_HEIGHT = BUTTON_BAR_HEIGHT;

export class SpriteEditScreen extends Phaser.GameObjects.Container {
  private readonly screenW: number;
  private readonly screenH: number;
  private readonly cardsAreaH: number;

  private cardsContainer!: Phaser.GameObjects.Container;
  private confirmDialog!: ConfirmDialog;

  // "ADD SPRITE" row pinned after the last card (lives in the scroll column).
  private addSpriteRow!: Phaser.GameObjects.Container;
  private addSpriteBg!: Phaser.GameObjects.Rectangle;
  private addSpriteBorder!: Phaser.GameObjects.Graphics;

  // Card awaiting delete confirmation (set while the confirm dialog is open).
  private pendingDeleteCard?: SpriteCard;

  private images: ImageItem[];
  // `cards` is the single source of truth for sprite data (each SpriteCard owns
  // its SpriteData); collectSprites() derives the SpriteData[] from it.
  private cards: SpriteCard[] = [];

  private mode: EditMode = 'card';
  private cursorIdx = 0;
  private focusedField: CardField = 'freq';
  private viewportY = 0;

  private keyboard!: ScreenKeyboard;

  constructor(
    scene: Phaser.Scene,
    width: number,
    height: number,
    images: ImageItem[],
    sprites: SpriteData[],
  ) {
    super(scene, 0, 0);
    this.screenW = width;
    this.screenH = height;
    // Leave room at the bottom for the scene-owned navigation bar.
    this.cardsAreaH = height - CARD_AREA_PAD * 2 - BUTTON_BAR_HEIGHT;
    this.images = images;

    this.buildUI(sprites);
    this.installKeyboard();
    scene.add.existing(this);
    if (this.cards.length === 0) {
      this.addCard();
    } else {
      this.updateCardFocus();
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  applyFrames(spriteId: string, frameIds: string[]) {
    const card = this.cards.find(c => c.spriteId === spriteId);
    card?.setFrames(frameIds);
  }

  pause() {
    this.keyboard.pause();
  }

  resume() {
    this.updateCardFocus();
    this.keyboard.resume();
  }

  /** Re-take focus from the shared nav (lands on the last card). */
  focusFromNav() {
    this.mode = 'card';
    this.cursorIdx = Math.max(0, this.cards.length - 1);
    this.updateCardFocus();
    this.scrollToCard(this.cursorIdx);
  }

  collectSprites(): SpriteData[] { return this.cards.map(c => c.spriteData); }

  update() { /* event-driven */ }

  destroy(fromScene?: boolean) {
    this.keyboard.destroy();
    super.destroy(fromScene);
  }

  // ── Build ───────────────────────────────────────────────────────────────────

  private buildUI(initialSprites: SpriteData[]) {
    this.add(this.scene.add.rectangle(0, 0, this.screenW, this.screenH, COLORS.BG).setOrigin(0, 0));

    this.cardsContainer = this.scene.add.container(0, CARD_AREA_PAD);
    this.add(this.cardsContainer);

    this.buildAddSpriteRow();

    initialSprites.forEach((sd, i) => this.createCard(sd, i));
    this.repositionAddButton();

    // Shared modal confirm dialog (delete confirmation); drawn on top, hidden
    // until a delete is requested.
    this.confirmDialog = new ConfirmDialog(this.scene, { width: this.screenW, height: this.screenH });
    this.confirmDialog.on('confirm', () => this.confirmDelete());
    this.confirmDialog.on('cancel', () => this.hideDeleteConfirm());
    this.add(this.confirmDialog);
  }

  private createCard(spriteData: SpriteData, index: number): SpriteCard {
    const y = index * (CARD_HEIGHT + CARD_GAP);
    const card = new SpriteCard(this.scene, 0, y, this.screenW, spriteData, this.images);
    this.cardsContainer.add(card);
    this.cards.push(card);
    this.wireCardEvents(card);
    this.repositionAddButton();
    return card;
  }

  private wireCardEvents(card: SpriteCard) {
    card.on('hover', () => {
      if (this.mode === 'field') return;
      const idx = this.cards.indexOf(card);
      // Hovering a card while the ADD row is focused hands focus back to cards.
      if (this.mode === 'add') this.mode = 'card';
      if (idx >= 0 && (idx !== this.cursorIdx || this.mode === 'card')) {
        this.cursorIdx = idx;
        this.updateCardFocus();
      }
    });

    card.on('hover-field', (field: CardField) => {
      if (this.mode !== 'field') return;
      if (this.cards.indexOf(card) !== this.cursorIdx) return;
      this.focusedField = field;
      this.updateFieldFocus();
    });

    card.on('activate', (field: CardField) => {
      const idx = this.cards.indexOf(card);
      if (idx < 0) return;

      // Deactivate old card
      if (idx !== this.cursorIdx) {
        this.cards[this.cursorIdx]?.setFieldFocus(null);
        this.cards[this.cursorIdx]?.setCardFocus(false);
      }

      // Mouse click: enter field mode on the clicked field
      this.cursorIdx = idx;
      this.mode = 'field';
      this.focusedField = field;
      this.updateCardFocus();
      this.updateFieldFocus();
      if (field === 'selectFrames' || field === 'copy' || field === 'delete') card.activateCurrentField();
    });

    card.on('delete', () => this.showDeleteConfirm(card));

    card.on('copy', () => this.duplicateCard(card));

    card.on('go-to-frames', () => {
      this.emit('go-to-frames', { spriteId: card.spriteId, currentFrames: card.spriteData.frames });
    });
  }

  // ── Keyboard ─────────────────────────────────────────────────────────────────

  private installKeyboard() {
    this.keyboard = new ScreenKeyboard({
      scene: this.scene,
      canAttach: () => this.active,
      deferAttach: true,
      shouldHandleKeyDown: () => !(this.mode === 'field' && this.cards[this.cursorIdx]?.isTextInputActive),
      onKeyDown: (code: string) => {
        if (this.confirmDialog.isOpen) { this.confirmDialog.handleKey(code); return; }
        if (this.mode === 'card') this.handleCardModeKey(code);
        else if (this.mode === 'add') this.handleAddModeKey(code);
        else this.handleFieldModeKey(code);
      },
    });
    this.keyboard.attach();
  }

  private handleCardModeKey(code: string) {
    const lastCardIdx = this.cards.length - 1;
    switch (code) {
      case 'ArrowUp':
        // First card is the top of the list — nothing above it now.
        if (this.cursorIdx > 0) { this.cursorIdx--; this.updateCardFocus(); this.scrollToCard(this.cursorIdx); }
        break;
      case 'ArrowDown':
        if (this.cursorIdx < lastCardIdx) { this.cursorIdx++; this.updateCardFocus(); this.scrollToCard(this.cursorIdx); }
        else this.focusAddButton();
        break;
      case 'Escape':
        // Escape ascends to the upper level (back to the Library). Left/Right
        // do nothing here — they're reserved for value tweaks inside number
        // fields (NumberInput) only.
        this.cards[this.cursorIdx]?.setCardFocus(false);
        this.emit('back');
        break;
      case 'Space':
      case 'Enter':
        // Space/Enter descends into the card's fields.
        if (this.cards.length > 0) this.enterFieldMode(CARD_FIELDS[0]);
        break;
    }
  }

  /** Hand focus down to the scene-owned navigation bar. */
  private leaveToNav() {
    this.cards[this.cursorIdx]?.setCardFocus(false);
    this.emit('nav-down');
  }

  private handleAddModeKey(code: string) {
    switch (code) {
      case 'ArrowUp':
        if (this.cards.length > 0) {
          this.mode = 'card';
          this.cursorIdx = this.cards.length - 1;
          this.updateCardFocus();
          this.scrollToCard(this.cursorIdx);
        }
        break;
      case 'ArrowDown':
        // Below the ADD row sits the scene-owned bottom nav.
        this.mode = 'card';
        this.refreshAddButtonVisuals();
        this.leaveToNav();
        break;
      case 'Space':
      case 'Enter':
        this.addCard();
        break;
      case 'Escape':
        if (this.cards.length > 0) {
          this.mode = 'card';
          this.cursorIdx = this.cards.length - 1;
          this.updateCardFocus();
          this.scrollToCard(this.cursorIdx);
        } else {
          this.emit('back');
        }
        break;
    }
  }

  /** Focus the "ADD SPRITE" row (from the last card, or hover/click). */
  private focusAddButton() {
    if (this.mode === 'field') this.cards[this.cursorIdx]?.setFieldFocus(null);
    this.mode = 'add';
    this.updateCardFocus();
    this.scrollToAddButton();
  }

  private handleFieldModeKey(code: string) {
    const card = this.cards[this.cursorIdx];
    if (!card) return;

    const isNum     = this.focusedField === 'freq' || this.focusedField === 'repeat' || this.focusedField === 'repeatDelay';
    const fieldIdx  = CARD_FIELDS.indexOf(this.focusedField);

    switch (code) {
      case 'Escape':
        this.exitFieldMode();
        break;

      case 'ArrowRight':
        if (isNum) card.incrementField();
        break;

      case 'ArrowLeft':
        // Left/Right only tweak number fields; on non-number fields they're
        // inert (use Escape/Up to leave a field).
        if (isNum) card.decrementField();
        break;

      case 'ArrowUp':
        if (fieldIdx > 0) {
          // Move up within this card's fields
          this.focusedField = CARD_FIELDS[fieldIdx - 1];
          this.updateFieldFocus();
        } else if (this.cursorIdx > 0) {
          // At the first field: jump to previous card's last field
          this.cursorIdx--;
          this.focusedField = CARD_FIELDS[CARD_FIELDS.length - 1];
          this.updateCardFocus();
          this.updateFieldFocus();
          this.scrollToCard(this.cursorIdx);
        } else {
          // Move out to card-mode when going above the first field of the first card
          this.exitFieldMode();
        }
        break;

      case 'ArrowDown':
        if (fieldIdx < CARD_FIELDS.length - 1) {
          // Move down within this card's fields
          this.focusedField = CARD_FIELDS[fieldIdx + 1];
          this.updateFieldFocus();
        } else if (this.cursorIdx < this.cards.length - 1) {
          // At last field: jump to next card's first field
          this.cursorIdx++;
          this.focusedField = CARD_FIELDS[0];
          this.updateCardFocus();
          this.updateFieldFocus();
          this.scrollToCard(this.cursorIdx);
        } else {
          // Last field of the last card: drop down to the ADD SPRITE row.
          this.focusAddButton();
        }
        break;

      case 'Space':
        if (!isNum) card.activateCurrentField();
        break;
    }
  }

  // ── Mode transitions ─────────────────────────────────────────────────────────

  private enterFieldMode(field: CardField) {
    if (this.cursorIdx >= this.cards.length) return;
    this.mode = 'field';
    this.focusedField = field;
    this.updateCardFocus();
    this.updateFieldFocus();
  }

  private exitFieldMode() {
    this.cards[this.cursorIdx]?.setFieldFocus(null);
    this.mode = 'card';
    this.updateCardFocus();
  }

  // ── Visuals ───────────────────────────────────────────────────────────────────

  private updateCardFocus() {
    this.cards.forEach((c, i) => {
      c.setCardFocus(i === this.cursorIdx && this.mode === 'card');
      if (this.mode !== 'field' || i !== this.cursorIdx) c.setFieldFocus(null);
    });
    this.refreshAddButtonVisuals();
    this.syncPreviewPlayback();
  }

  private updateFieldFocus() {
    const card = this.cards[this.cursorIdx];
    if (card) { card.setCardFocus(false); card.setFieldFocus(this.focusedField); }
    this.syncPreviewPlayback();
  }

  private syncPreviewPlayback() {
    const activeCardIndex = this.mode === 'card' || this.mode === 'field'
      ? this.cursorIdx
      : -1;

    this.cards.forEach((card, index) => {
      card.setPreviewPlayback(index === activeCardIndex);
    });
  }

  // ── Scroll ───────────────────────────────────────────────────────────────────

  private scrollToCard(idx: number) {
    this.scrollIntoView(idx * (CARD_HEIGHT + CARD_GAP), CARD_HEIGHT);
  }

  private scrollToAddButton() {
    this.scrollIntoView(this.addButtonTop(), ADD_ROW_HEIGHT);
  }

  /** Scroll the column so the given row (top..top+height) is fully in view. */
  private scrollIntoView(top: number, height: number) {
    const bottom = top + height;
    if (top < -this.viewportY) this.viewportY = -top;
    else if (bottom > this.cardsAreaH - this.viewportY) this.viewportY = this.cardsAreaH - bottom;
    this.viewportY = Math.min(0, this.viewportY);
    this.cardsContainer.setY(CARD_AREA_PAD + this.viewportY);
    this.clipCardVisibility();
  }

  private clipCardVisibility() {
    const visTop = -this.viewportY;
    const visBottom = visTop + this.cardsAreaH;
    this.cards.forEach((c, i) => {
      const top = i * (CARD_HEIGHT + CARD_GAP);
      c.setVisible(top + CARD_HEIGHT > visTop && top < visBottom);
    });
    // The ADD row hides while scrolled out of view.
    const addTop = this.addButtonTop();
    this.addSpriteRow.setVisible(addTop + ADD_ROW_HEIGHT > visTop && addTop < visBottom);
  }

  // ── "ADD SPRITE" row ────────────────────────────────────────────────────────

  private buildAddSpriteRow() {
    this.addSpriteRow = this.scene.add.container(0, 0);

    this.addSpriteBg = this.scene.add
      .rectangle(0, 0, this.screenW, ADD_ROW_HEIGHT, COLORS.BUTTON_BG)
      .setOrigin(0, 0)
      .setInteractive({ cursor: 'pointer' });
    // Hover focuses the row (unless typing); click adds a sprite.
    this.addSpriteBg.on('pointerover', () => {
      if (this.mode === 'field') return;
      this.focusAddButton();
    });
    this.addSpriteBg.on('pointerdown', () => this.addCard());

    this.addSpriteBorder = this.scene.add.graphics();

    const label = this.scene.add
      .text(Math.floor(this.screenW / 2), Math.floor(ADD_ROW_HEIGHT / 2), '+ ADD SPRITE', {
        fontFamily: FONT.FAMILY,
        fontSize: FONT.SIZE,
        color: hex(COLORS.TEXT_BUTTON),
        resolution: 1,
      })
      .setOrigin(0.5);

    this.addSpriteRow.add([this.addSpriteBg, this.addSpriteBorder, label]);
    this.cardsContainer.add(this.addSpriteRow);
  }

  /** Y of the ADD row: the slot right after the last card. */
  private addButtonTop(): number {
    return this.cards.length * (CARD_HEIGHT + CARD_GAP);
  }

  private repositionAddButton() {
    this.addSpriteRow.setY(this.addButtonTop());
  }

  private refreshAddButtonVisuals() {
    this.addSpriteBorder.clear();
    if (this.mode === 'add') {
      this.addSpriteBorder.lineStyle(2, COLORS.BUTTON_FOCUSED_BORDER, 1);
      this.addSpriteBorder.strokeRect(0, 0, this.screenW, ADD_ROW_HEIGHT);
    }
  }

  // ── Card operations ───────────────────────────────────────────────────────────

  private addCard() {
    const sd = DEFAULT_SPRITE();
    const newIdx = this.cards.length; // before createCard pushes
    this.createCard(sd, newIdx);
    // Focus the new card (name is auto-assigned, so there's nothing to type).
    this.mode = 'card';
    this.cursorIdx = newIdx;
    this.updateCardFocus();
    this.scrollToCard(this.cursorIdx);
  }

  /** Duplicate a sprite's config into a new card inserted right after it. */
  private duplicateCard(source: SpriteCard) {
    const src = source.spriteData;
    // Fresh id + auto number name; copy frames/timing from the source.
    const sd: SpriteData = {
      ...DEFAULT_SPRITE(),
      frames: [...src.frames],
      freq: src.freq,
      repeat: src.repeat,
      repeatDelay: src.repeatDelay,
    };

    const srcIdx = this.cards.indexOf(source);
    const insertIdx = srcIdx < 0 ? this.cards.length : srcIdx + 1;

    const card = new SpriteCard(this.scene, 0, 0, this.screenW, sd, this.images);
    this.cardsContainer.add(card);
    this.cards.splice(insertIdx, 0, card);
    this.wireCardEvents(card);
    this.cards.forEach((c, i) => c.setPosition(0, i * (CARD_HEIGHT + CARD_GAP)));
    this.repositionAddButton();

    this.mode = 'card';
    this.cursorIdx = insertIdx;
    this.updateCardFocus();
    this.scrollToCard(this.cursorIdx);
  }

  private deleteCard(card: SpriteCard) {
    const idx = this.cards.indexOf(card);
    if (idx < 0) return;
    card.destroy();
    this.cards.splice(idx, 1);
    this.cards.forEach((c, i) => c.setPosition(0, i * (CARD_HEIGHT + CARD_GAP)));
    this.repositionAddButton();
    this.mode = 'card';
    this.cursorIdx = Math.min(this.cursorIdx, Math.max(0, this.cards.length - 1));
    if (this.cards.length === 0) this.cursorIdx = 0;
    this.updateCardFocus();
    this.scrollToCard(this.cursorIdx);
  }

  // ── Delete confirmation (inline: overlay message + CONFIRM/CANCEL nav) ─────────

  private showDeleteConfirm(card: SpriteCard) {
    this.pendingDeleteCard = card;
    // Drop focus on the screen behind the dialog so nothing stays highlighted.
    this.cards[this.cursorIdx]?.setFieldFocus(null);
    this.cards[this.cursorIdx]?.setCardFocus(false);
    // Modal takes the bottom of the screen; ask the scene to hide its nav.
    this.emit('nav-suppress', true);

    const name = card.spriteData.prefix.trim() || 'this sprite';
    this.confirmDialog.open(`Are you sure?\nDelete "${name}"?`);
  }

  private hideDeleteConfirm() {
    this.pendingDeleteCard = undefined;
    this.confirmDialog.close();
    this.emit('nav-suppress', false);
    this.mode = 'card';
    this.updateCardFocus();
  }

  private confirmDelete() {
    const card = this.pendingDeleteCard;
    this.hideDeleteConfirm();
    if (card) this.deleteCard(card);
  }
}
