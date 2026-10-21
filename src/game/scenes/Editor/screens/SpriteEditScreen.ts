import Phaser from 'phaser';
import {
  SpriteCard,
  CardField,
  ConfirmDialog,
} from '../elements';
import { ScreenKeyboard } from '@/game/ui';
import {
  FocusRouter,
  FocusScope,
  Focusable,
  createScope,
  makeFocusable,
} from '@/game/ui/focus';
import {
  COLORS,
  FONT_CJK,
  BUTTON_BAR_HEIGHT,
  CARD_HEIGHT, CARD_GAP, CARD_AREA_PAD,
  hex,
} from '../constants';
import { SpriteData, ImageItem, NavHost } from '../types';
import { EditorScreen } from './EditorScreen';

let _spriteIdCounter = 1;

// New sprites get an auto-assigned placeholder prefix; there is no name input.
// Import/preset sprites keep their own prefix. The '-' separator matters: '_' is
// reserved for the frame index, so a prefix must never contain one (a prefix
// 'sprite_1' would export frames named 'sprite_1_1', which no longer parses
// back to a prefix unambiguously).
const DEFAULT_SPRITE = (): SpriteData => {
  const n = _spriteIdCounter++;
  return {
    id: `sprite_${n}`,
    prefix: `sprite-${n}`,
    frames: [],
    freq: 8,
    repeat: -1,
    repeatDelay: 0,
  };
};

// "ADD SPRITE" row: a full-width button that rides at the bottom of the
// scrolling column, in the slot where the next card would appear.
const ADD_ROW_HEIGHT = BUTTON_BAR_HEIGHT;

/**
 * S2 – SpriteEditScreen
 *
 * A scrolling column of {@link SpriteCard}s + an "ADD SPRITE" row, with the
 * shared bottom nav below. The whole column is ONE focusable driven by the
 * {@link FocusRouter}: it navigates cards/fields/ADD by index (geometry can't be
 * used for a scrolling list — off-screen cards sit below the fixed nav bar), and
 * bridges to the nav at its top/bottom edges (first field ↑ → nav, ADD ↓ → nav,
 * nav ↑ → ADD, nav ↓ → first field). Left/Right adjust number fields; delete is
 * a pushed modal scope.
 */
export class SpriteEditScreen extends EditorScreen {
  private readonly screenW: number;
  private readonly screenH: number;
  private readonly cardsAreaH: number;
  private readonly navHost: NavHost;

  private cardsContainer!: Phaser.GameObjects.Container;
  private confirmDialog!: ConfirmDialog;

  // "ADD SPRITE" row pinned after the last card (lives in the scroll column).
  private addSpriteRow!: Phaser.GameObjects.Container;
  private addSpriteBg!: Phaser.GameObjects.Rectangle;
  private addSpriteBorder!: Phaser.GameObjects.Graphics;

  // Card awaiting delete confirmation (set while the confirm dialog is open).
  private pendingDeleteCard?: SpriteCard;

  private images: ImageItem[];
  // `cards` is the single source of truth for sprite data.
  private cards: SpriteCard[] = [];
  private cardIndex = new Map<SpriteCard, number>();
  private viewportY = 0;

  // Linear cursor over the column: 0..cards.length; === cards.length is the ADD row.
  private cursorIdx = 0;

  // Focus model.
  private readonly router = new FocusRouter();
  private cardsFocusable!: Focusable;
  private navFocusable!: Focusable;
  private scope!: FocusScope;
  private dialogScope!: FocusScope;

  constructor(
    scene: Phaser.Scene,
    width: number,
    height: number,
    images: ImageItem[],
    sprites: SpriteData[],
    navHost: NavHost,
  ) {
    super(scene);
    this.screenW = width;
    this.screenH = height;
    this.navHost = navHost;
    // Leave room at the bottom for the scene-owned navigation bar.
    this.cardsAreaH = height - CARD_AREA_PAD * 2 - BUTTON_BAR_HEIGHT;
    this.images = images;

    this.buildUI(sprites);
    this.setupFocus();
    this.installKeyboard();
    scene.add.existing(this);
    this.keyboard.attach();

    this.router.setBaseScope(this.scope, 'first');
    if (this.cards.length === 0) this.addCard();
    else this.focusTop();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Swap in a new image pool. The frame selector can delete images while this
   * screen is parked underneath it, and each card holds its own reference —
   * left stale, a card would try to animate a texture that no longer exists.
   */
  setImages(images: ImageItem[]) {
    this.images = images;
    this.cards.forEach((card) => card.setImages(images));
  }

  applyFrames(spriteId: string, frameIds: string[]) {
    const card = this.cards.find(c => c.spriteId === spriteId);
    card?.setFrames(frameIds);
  }

  pause() {
    this.router.pause();
    this.keyboard.pause();
  }

  resume() {
    this.keyboard.resume();
    this.router.resume();
  }

  /** Move focus from the nav back into the card content (scene 'sprites' action). */
  focusContent(edge: 'first' | 'last' = 'last') {
    this.router.focusId('cards');
    if (edge === 'last') this.focusBottom();
    else this.focusTop();
  }

  collectSprites(): SpriteData[] { return this.cards.map(c => c.spriteData); }

  update() { /* event-driven */ }

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

  private setupFocus() {
    // The card column is one focusable; its bounds are the (stable) visible card
    // area so the nav's upward geometry reliably lands on it.
    const cardsArea = {
      getBounds: () => new Phaser.Geom.Rectangle(0, CARD_AREA_PAD, this.screenW, this.cardsAreaH),
    };

    this.cardsFocusable = makeFocusable({
      id: 'cards',
      object: cardsArea,
      onFocus: (from) => {
        if (from === 'UP') this.focusBottom();
        else if (from === 'DOWN') this.focusTop();
        else this.applyVisual();
      },
      onBlur: () => this.blurColumn(),
      onSelect: () => {
        if (this.onAddRow) this.addCard();
        else this.currentCard()?.activateCurrentField();
      },
      handleDirection: (dir) => {
        switch (dir) {
          case 'LEFT':  this.currentCard()?.adjustFocusedField(-1); return true;
          case 'RIGHT': this.currentCard()?.adjustFocusedField(1);  return true;
          case 'UP':    return this.stepUp();
          case 'DOWN':  return this.stepDown();
          default:      return false;
        }
      },
    });

    this.navFocusable = this.navHost.buildNavFocusable(
      (edge) => this.focusContent(edge),
      () => this.router.focusId('nav'),
    );

    this.scope = createScope({
      id: 'sprite-edit',
      members: () => [this.cardsFocusable, this.navFocusable],
      onCancel: () => this.emit('back'), // Escape on the column ascends to the Library
      boundaryOverride: {
        // nav ↓ → top of the column (wrap). (nav ↑ reaches the column by geometry.)
        DOWN: () => this.router.focusId('cards', 'DOWN'),
      },
    });

    // Delete confirmation: a modal scope forwarding every key to the dialog.
    this.dialogScope = createScope({
      id: 'confirm',
      members: () => [this.confirmDialog.asFocusable('confirm-dialog')],
    });
  }

  // ── Column cursor ─────────────────────────────────────────────────────────────

  private get onAddRow(): boolean { return this.cursorIdx >= this.cards.length; }
  private currentCard(): SpriteCard | undefined { return this.cards[this.cursorIdx]; }

  private stepUp(): boolean {
    if (this.onAddRow) {
      if (this.cards.length > 0) { this.focusCard(this.cards.length - 1, 'last'); return true; }
      this.router.focusId('nav');
      return true;
    }
    const card = this.currentCard();
    if (card && card.moveFieldFocus(-1)) { this.applyVisual(); return true; }
    if (this.cursorIdx > 0) { this.focusCard(this.cursorIdx - 1, 'last'); return true; }
    this.router.focusId('nav'); // first card, first field ↑ → nav (wrap)
    return true;
  }

  private stepDown(): boolean {
    if (this.onAddRow) { this.router.focusId('nav'); return true; } // ADD ↓ → nav
    const card = this.currentCard();
    if (card && card.moveFieldFocus(1)) { this.applyVisual(); return true; }
    if (this.cursorIdx < this.cards.length - 1) { this.focusCard(this.cursorIdx + 1, 'first'); return true; }
    this.focusAdd(); // last card, last field ↓ → ADD row
    return true;
  }

  private focusTop() {
    if (this.cards.length > 0) this.focusCard(0, 'first');
    else this.focusAdd();
  }

  private focusBottom() {
    // Coming up from the nav lands on the bottom-most element (the ADD row).
    this.focusAdd();
  }

  private focusCard(idx: number, edge: 'first' | 'last') {
    this.cursorIdx = idx;
    this.cards[idx]?.focusFieldEdge(edge);
    this.applyVisual();
  }

  private focusAdd() {
    this.cursorIdx = this.cards.length;
    this.applyVisual();
  }

  /** Apply focus visuals for the current cursor: highlight, scroll, preview. */
  private applyVisual() {
    this.cards.forEach((c, i) => {
      if (i !== this.cursorIdx) { c.setFieldFocus(null); c.setCardFocus(false); c.setPreviewPlayback(false); }
    });
    this.refreshAddButtonVisuals();
    if (this.onAddRow) {
      this.scrollToAddButton();
    } else {
      this.currentCard()?.setPreviewPlayback(true);
      this.scrollToCard(this.cursorIdx);
    }
  }

  private blurColumn() {
    this.currentCard()?.setFieldFocus(null);
    this.currentCard()?.setCardFocus(false);
    this.cards.forEach(c => c.setPreviewPlayback(false));
    this.refreshAddButtonVisuals(false);
  }

  // ── Cards ─────────────────────────────────────────────────────────────────────

  private createCard(spriteData: SpriteData, index: number): SpriteCard {
    const y = index * (CARD_HEIGHT + CARD_GAP);
    const card = new SpriteCard(this.scene, 0, y, this.screenW, spriteData, this.images);
    this.cardsContainer.add(card);
    this.cards.push(card);
    this.reindexCards();
    this.wireCardEvents(card);
    this.repositionAddButton();
    return card;
  }

  private reindexCards() {
    this.cardIndex.clear();
    this.cards.forEach((c, i) => this.cardIndex.set(c, i));
  }

  /** Mouse wiring: pointer moves/clicks set the column cursor + take focus. */
  private wireCardEvents(card: SpriteCard) {
    card.on('hover', () => this.focusCardFromPointer(card));
    card.on('hover-field', (field: CardField) => this.focusCardFromPointer(card, field));
    card.on('activate', (field: CardField) => {
      this.focusCardFromPointer(card, field);
      if (field === 'selectFrames' || field === 'copy' || field === 'delete') card.activateCurrentField();
    });
    card.on('delete', () => this.showDeleteConfirm(card));
    card.on('copy', () => this.duplicateCard(card));
    card.on('go-to-frames', () => {
      this.emit('go-to-frames', { spriteId: card.spriteId, currentFrames: card.spriteData.frames });
    });
  }

  private focusCardFromPointer(card: SpriteCard, field?: CardField) {
    const idx = this.cardIndex.get(card);
    if (idx === undefined) return;
    this.cursorIdx = idx;
    if (field) card.setFieldFocus(field);
    else card.focusFieldEdge('first');
    this.applyVisual();
    this.router.focusId('cards');
  }

  // ── Keyboard ─────────────────────────────────────────────────────────────────

  private installKeyboard() {
    this.keyboard = new ScreenKeyboard({
      scene: this.scene,
      canAttach: () => this.active,
      deferAttach: true,
      onKeyDown: (code: string) => this.router.handleKey(code),
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
    this.addSpriteBg.on('pointerover', () => { this.focusAdd(); this.router.focusId('cards'); });
    this.addSpriteBg.on('pointerdown', () => this.addCard());

    this.addSpriteBorder = this.scene.add.graphics();

    const label = this.scene.add
      .text(Math.floor(this.screenW / 2), Math.floor(ADD_ROW_HEIGHT / 2), '+ ADD SPRITE', {
        fontFamily: FONT_CJK.FAMILY,
        fontSize: `${FONT_CJK.SIZE}px`,
        color: hex(COLORS.TEXT_BUTTON),
        resolution: FONT_CJK.RESOLUTION,
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

  private refreshAddButtonVisuals(focused = this.onAddRow) {
    this.addSpriteBorder.clear();
    if (focused) {
      this.addSpriteBorder.lineStyle(2, COLORS.BUTTON_FOCUSED_BORDER, 1);
      this.addSpriteBorder.strokeRect(0, 0, this.screenW, ADD_ROW_HEIGHT);
    }
  }

  // ── Card operations ───────────────────────────────────────────────────────────

  private addCard() {
    this.createCard(DEFAULT_SPRITE(), this.cards.length);
    this.focusCard(this.cards.length - 1, 'first');
    this.router.focusId('cards');
  }

  /** Duplicate a sprite's config into a new card inserted right after it. */
  private duplicateCard(source: SpriteCard) {
    const src = source.spriteData;
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
    this.reindexCards();
    this.wireCardEvents(card);
    this.cards.forEach((c, i) => c.setPosition(0, i * (CARD_HEIGHT + CARD_GAP)));
    this.repositionAddButton();

    this.focusCard(insertIdx, 'first');
    this.router.focusId('cards');
  }

  private deleteCard(card: SpriteCard) {
    const idx = this.cards.indexOf(card);
    if (idx < 0) return;
    card.destroy();
    this.cards.splice(idx, 1);
    this.reindexCards();
    this.cards.forEach((c, i) => c.setPosition(0, i * (CARD_HEIGHT + CARD_GAP)));
    this.repositionAddButton();
    // Keep the cursor in range and re-apply focus visuals.
    this.cursorIdx = Math.min(this.cursorIdx, this.cards.length);
    if (this.cards.length === 0) this.focusAdd();
    else this.focusCard(Math.min(this.cursorIdx, this.cards.length - 1), 'first');
  }

  // ── Delete confirmation (modal scope) ─────────────────────────────────────────

  private showDeleteConfirm(card: SpriteCard) {
    this.pendingDeleteCard = card;
    this.emit('nav-suppress', true);
    const name = card.spriteData.prefix.trim() || 'this sprite';
    this.confirmDialog.open(`Are you sure?\nDelete "${name}"?`);
    this.router.pushModal(this.dialogScope);
  }

  private hideDeleteConfirm() {
    this.pendingDeleteCard = undefined;
    this.confirmDialog.close();
    this.emit('nav-suppress', false);
    this.router.popModal();
  }

  private confirmDelete() {
    const card = this.pendingDeleteCard;
    this.hideDeleteConfirm();
    if (card) this.deleteCard(card);
  }
}
