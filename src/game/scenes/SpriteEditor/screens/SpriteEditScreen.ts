import Phaser from 'phaser';
import { SpriteCard, CardField, CARD_FIELDS } from '../components/SpriteCard';
import { ButtonBar } from '../components/ButtonBar';
import {
  COLORS, FONT,
  BUTTON_BAR_HEIGHT,
  CARD_HEIGHT, CARD_GAP, CARD_AREA_PAD,
} from '../constants';
import { SpriteData, ImageItem } from '../types';

let _spriteIdCounter = 1;
const newSpriteId = () => `sprite_${_spriteIdCounter++}`;

const DEFAULT_SPRITE = (): SpriteData => ({
  id: newSpriteId(),
  prefix: '',
  frames: [],
  freq: 8,
  repeat: -1,
  repeatDelay: 0,
});

const BUTTONS_DEFAULT = [
  { key: 'back',   label: 'Back'   },
  { key: 'select', label: '選取'   },
  { key: 'export', label: 'Export' },
];

const BUTTONS_SELECT = (n: number) => [
  { key: 'select-cancel', label: '取消' },
  { key: 'select-delete', label: n > 0 ? `刪除(${n})` : '刪除' },
];

type EditMode = 'card' | 'field' | 'button-bar';

export class SpriteEditScreen extends Phaser.GameObjects.Container {
  private readonly screenW: number;
  private readonly screenH: number;
  private readonly cardsAreaH: number;
  private readonly buttonBarY: number;

  private cardsContainer!: Phaser.GameObjects.Container;
  private addCell!: Phaser.GameObjects.Container;
  private addCellBg!: Phaser.GameObjects.Rectangle;
  private addCellBorder!: Phaser.GameObjects.Graphics;
  private buttonBar!: ButtonBar;

  private sprites: SpriteData[];
  private images: ImageItem[];
  private cards: SpriteCard[] = [];

  private mode: EditMode = 'card';
  private cursorIdx = 0;
  private focusedField: CardField = 'name';
  private viewportY = 0;

  private selectMode = false;
  private selectedCardIds = new Set<string>();

  private heldKeys = new Set<string>();
  private navKeydownHandler!: (e: KeyboardEvent) => void;
  private navKeyupHandler!: (e: KeyboardEvent) => void;

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
    this.buttonBarY = height - BUTTON_BAR_HEIGHT;
    this.cardsAreaH = this.buttonBarY - CARD_AREA_PAD;
    this.images = images;
    this.sprites = sprites;

    this.buildUI();
    this.installKeyboard();
    scene.add.existing(this);
    this.updateCardFocus();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  applyFrames(spriteId: string, frameIds: string[]) {
    const card = this.cards.find(c => c.spriteId === spriteId);
    card?.setFrames(frameIds);
  }

  pause() {
    this.scene.input.keyboard!.off('keydown', this.navKeydownHandler);
    this.scene.input.keyboard!.off('keyup', this.navKeyupHandler);
    this.heldKeys.clear();
  }

  resume() {
    this.heldKeys.clear();
    this.updateCardFocus();
    // Defer by one frame so the key-press that closed S3 is not re-processed here
    this.scene.time.delayedCall(0, () => {
      if (!this.active) return;
      this.scene.input.keyboard!.on('keydown', this.navKeydownHandler);
      this.scene.input.keyboard!.on('keyup', this.navKeyupHandler);
    });
  }

  collectSprites(): SpriteData[] { return this.cards.map(c => c.spriteData); }

  update() { /* event-driven */ }

  destroy(fromScene?: boolean) {
    this.scene.input.keyboard!.off('keydown', this.navKeydownHandler);
    this.scene.input.keyboard!.off('keyup', this.navKeyupHandler);
    super.destroy(fromScene);
  }

  // ── Build ───────────────────────────────────────────────────────────────────

  private buildUI() {
    this.add(this.scene.add.rectangle(0, 0, this.screenW, this.screenH, COLORS.BG).setOrigin(0, 0));

    this.cardsContainer = this.scene.add.container(0, CARD_AREA_PAD);
    this.add(this.cardsContainer);

    this.sprites.forEach((sd, i) => this.createCard(sd, i));
    this.buildAddCell();

    this.buttonBar = new ButtonBar(this.scene, this.buttonBarY, this.screenW, BUTTONS_DEFAULT);
    this.buttonBar.on('action', (key: string) => this.handleButtonAction(key));
    this.add(this.buttonBar);
  }

  private buildAddCell() {
    this.addCell = this.scene.add.container(0, 0);

    this.addCellBg = this.scene.add
      .rectangle(0, 0, this.screenW, CARD_HEIGHT, COLORS.GRID_AREA_BG)
      .setOrigin(0, 0)
      .setInteractive({ cursor: 'pointer' });
    this.addCellBg.on('pointerover', () => {
      if (this.selectMode) return;
      this.cursorIdx = this.cards.length;
      this.updateCardFocus();
    });
    this.addCellBg.on('pointerdown', () => { if (!this.selectMode) this.addCard(); });
    this.addCell.add(this.addCellBg);

    this.addCell.add(
      this.scene.add.text(this.screenW / 2, CARD_HEIGHT / 2, '+新增', {
        fontFamily: FONT.FAMILY, fontSize: FONT.SIZE,
        color: '#' + COLORS.TEXT.toString(16).padStart(6, '0'),
      }).setOrigin(0.5),
    );

    this.addCellBorder = this.scene.add.graphics();
    this.addCell.add(this.addCellBorder);

    this.cardsContainer.add(this.addCell);
    this.repositionAddCell();
  }

  private repositionAddCell() {
    this.addCell.setPosition(0, this.cards.length * (CARD_HEIGHT + CARD_GAP));
  }

  private createCard(spriteData: SpriteData, index: number): SpriteCard {
    const y = index * (CARD_HEIGHT + CARD_GAP);
    const card = new SpriteCard(this.scene, 0, y, this.screenW, spriteData, this.images);
    // Insert into cardsContainer before the add-cell
    if (this.addCell) {
      const acIdx = this.cardsContainer.getIndex(this.addCell);
      if (acIdx >= 0) {
        this.cardsContainer.add(card);
        this.cardsContainer.moveTo(card, acIdx);
      } else {
        this.cardsContainer.add(card);
      }
    } else {
      this.cardsContainer.add(card);
    }
    this.cards.push(card);
    this.wireCardEvents(card);
    return card;
  }

  private wireCardEvents(card: SpriteCard) {
    card.on('hover', () => {
      if (this.selectMode || this.mode === 'field') return;
      const idx = this.cards.indexOf(card);
      if (idx >= 0 && idx !== this.cursorIdx) {
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
      if (this.selectMode) { this.toggleCardSelection(card); return; }

      const idx = this.cards.indexOf(card);
      if (idx < 0) return;

      // Deactivate old card
      if (idx !== this.cursorIdx) {
        this.cards[this.cursorIdx]?.setFieldFocus(null);
        this.cards[this.cursorIdx]?.setCardFocus(false);
      }

      // Mouse click: enter field mode at preview by default
      this.cursorIdx = idx;
      this.mode = 'field';
      this.focusedField = 'preview';
      this.buttonBar.deactivate();
      this.updateCardFocus();
      this.updateFieldFocus();
      if (field === 'preview') card.activateCurrentField();
    });

    card.on('go-to-frames', () => {
      this.emit('go-to-frames', { spriteId: card.spriteId, currentFrames: card.spriteData.frames });
    });
  }

  // ── Keyboard ─────────────────────────────────────────────────────────────────

  private installKeyboard() {
    this.navKeydownHandler = (e: KeyboardEvent) => {
      if (this.mode === 'field' && this.cards[this.cursorIdx]?.isTextInputActive) return;
      if (this.heldKeys.has(e.code)) return;
      this.heldKeys.add(e.code);
      if (this.selectMode) { this.handleSelectModeKey(e.code); return; }
      if (this.mode === 'card') this.handleCardModeKey(e.code);
      else if (this.mode === 'button-bar') this.handleButtonBarModeKey(e.code);
      else this.handleFieldModeKey(e.code);
    };
    this.navKeyupHandler = (e: KeyboardEvent) => this.heldKeys.delete(e.code);
    // Defer by one frame to avoid consuming the key-press that opened this screen
    this.scene.time.delayedCall(0, () => {
      if (!this.active) return;
      this.scene.input.keyboard!.on('keydown', this.navKeydownHandler);
      this.scene.input.keyboard!.on('keyup', this.navKeyupHandler);
    });
  }

  private handleSelectModeKey(code: string) {
    // Button bar is focused within select mode
    if (this.mode === 'button-bar') {
      switch (code) {
        case 'ArrowLeft':  this.buttonBar.moveCursor(-1); break;
        case 'ArrowRight': this.buttonBar.moveCursor(1);  break;
        case 'Space':      this.buttonBar.executeCursor(); break;
        case 'ArrowUp':
          this.mode = 'card';
          this.buttonBar.deactivate();
          this.updateCardFocus();
          break;
        case 'Escape': this.exitSelectMode(); break;
      }
      return;
    }

    // Cards are focused within select mode
    switch (code) {
      case 'Escape': this.exitSelectMode(); break;
      case 'ArrowUp':
        if (this.cursorIdx > 0) { this.cursorIdx--; this.updateCardFocus(); this.scrollToCard(this.cursorIdx); }
        break;
      case 'ArrowDown': {
        const max = this.cards.length - 1;
        if (this.cursorIdx < max) {
          this.cursorIdx++; this.updateCardFocus(); this.scrollToCard(this.cursorIdx);
        } else {
          this.mode = 'button-bar';
          this.buttonBar.activate();
          this.updateCardFocus();
        }
        break;
      }
      case 'Space': {
        const card = this.cards[this.cursorIdx];
        if (card) this.toggleCardSelection(card);
        break;
      }
    }
  }

  private handleCardModeKey(code: string) {
    const addCellIdx = this.cards.length;
    switch (code) {
      case 'ArrowUp':
        if (this.cursorIdx > 0) { this.cursorIdx--; this.updateCardFocus(); this.scrollToCard(this.cursorIdx); }
        break;
      case 'ArrowDown':
        if (this.cursorIdx < addCellIdx) { this.cursorIdx++; this.updateCardFocus(); this.scrollToCard(this.cursorIdx); }
        else { this.mode = 'button-bar'; this.buttonBar.activate(); this.updateCardFocus(); }
        break;
      case 'Space':
        if (this.cursorIdx === addCellIdx) this.addCard();
        else this.enterFieldMode('preview');
        break;
      case 'Escape':
        this.emit('back');
        break;
    }
  }

  private handleButtonBarModeKey(code: string) {
    switch (code) {
      case 'ArrowLeft':  this.buttonBar.moveCursor(-1); break;
      case 'ArrowRight': this.buttonBar.moveCursor(1);  break;
      case 'Space':      this.buttonBar.executeCursor(); break;
      case 'ArrowUp':
      case 'Escape':
        this.mode = 'card';
        this.buttonBar.deactivate();
        this.updateCardFocus();
        break;
    }
  }

  private handleFieldModeKey(code: string) {
    const card = this.cards[this.cursorIdx];
    if (!card) return;

    const isPreview = this.focusedField === 'preview';
    const isNum     = this.focusedField === 'freq' || this.focusedField === 'repeat' || this.focusedField === 'repeatDelay';
    const fieldIdx  = CARD_FIELDS.indexOf(this.focusedField);

    switch (code) {
      case 'Escape':
        if (isNum && card.isNumberEditActive) card.deactivateNumberEdit();
        else if (isPreview) this.exitFieldMode();
        else { this.focusedField = 'preview'; this.updateFieldFocus(); }
        break;

      case 'ArrowRight':
        if (isPreview) { this.focusedField = 'name'; this.updateFieldFocus(); }
        else if (isNum && card.isNumberEditActive) card.incrementField();
        break;

      case 'ArrowLeft':
        if (isNum && card.isNumberEditActive) card.decrementField();
        else if (!isPreview) { this.focusedField = 'preview'; this.updateFieldFocus(); }
        break;

      case 'ArrowUp':
        if (fieldIdx > 0) {
          // Move up within this card's fields
          this.focusedField = CARD_FIELDS[fieldIdx - 1];
          this.updateFieldFocus();
        } else if (this.cursorIdx > 0) {
          // At first field ('preview'): jump to previous card's last field
          this.cursorIdx--;
          this.focusedField = CARD_FIELDS[CARD_FIELDS.length - 1];
          this.updateCardFocus();
          this.updateFieldFocus();
          this.scrollToCard(this.cursorIdx);
        }
        break;

      case 'ArrowDown':
        if (fieldIdx < CARD_FIELDS.length - 1) {
          // Move down within this card's fields
          this.focusedField = CARD_FIELDS[fieldIdx + 1];
          this.updateFieldFocus();
        } else if (this.cursorIdx < this.cards.length - 1) {
          // At last field ('repeatDelay'): jump to next card's first field
          this.cursorIdx++;
          this.focusedField = CARD_FIELDS[0];
          this.updateCardFocus();
          this.updateFieldFocus();
          this.scrollToCard(this.cursorIdx);
        } else {
          // No next card: move to the add-cell
          this.mode = 'card';
          this.cursorIdx = this.cards.length;
          this.updateCardFocus();
          this.scrollToCard(this.cursorIdx);
        }
        break;

      case 'Space':
        if (isNum) card.activateNumberEdit();
        else card.activateCurrentField();
        break;
    }
  }

  // ── Mode transitions ─────────────────────────────────────────────────────────

  private enterFieldMode(field: CardField) {
    if (this.cursorIdx >= this.cards.length) return;
    this.mode = 'field';
    this.focusedField = field;
    this.buttonBar.deactivate();
    this.updateCardFocus();
    this.updateFieldFocus();
  }

  private exitFieldMode() {
    this.cards[this.cursorIdx]?.setFieldFocus(null);
    this.mode = 'card';
    this.updateCardFocus();
  }

  private enterSelectMode() {
    this.selectMode = true;
    this.selectedCardIds.clear();
    if (this.mode === 'field') this.exitFieldMode();
    this.mode = 'card';
    this.buttonBar.deactivate();
    this.addCell.setVisible(false);
    this.buttonBar.setButtons(BUTTONS_SELECT(0));
    this.cursorIdx = Math.min(this.cursorIdx, Math.max(0, this.cards.length - 1));
    this.updateCardFocus();
  }

  private exitSelectMode() {
    this.selectMode = false;
    this.selectedCardIds.clear();
    this.cards.forEach(c => c.setSelectState(false));
    this.addCell.setVisible(true);
    this.buttonBar.setButtons(BUTTONS_DEFAULT);
    this.cursorIdx = Math.min(this.cursorIdx, this.cards.length);
    this.updateCardFocus();
  }

  private toggleCardSelection(card: SpriteCard) {
    const id = card.spriteId;
    if (this.selectedCardIds.has(id)) { this.selectedCardIds.delete(id); card.setSelectState(false); }
    else                              { this.selectedCardIds.add(id);    card.setSelectState(true);  }
    this.buttonBar.setButtons(BUTTONS_SELECT(this.selectedCardIds.size));
  }

  private deleteSelectedCards() {
    this.cards
      .filter(c => this.selectedCardIds.has(c.spriteId))
      .forEach(c => this.deleteCard(c));
    this.exitSelectMode();
  }

  // ── Visuals ───────────────────────────────────────────────────────────────────

  private updateCardFocus() {
    const addFocused = this.cursorIdx === this.cards.length && this.mode === 'card';

    this.cards.forEach((c, i) => {
      c.setCardFocus(i === this.cursorIdx && this.mode === 'card');
      if (this.mode !== 'field' || i !== this.cursorIdx) c.setFieldFocus(null);
    });

    this.addCellBorder.clear();
    this.addCellBg.setFillStyle(COLORS.GRID_AREA_BG);
    if (addFocused) {
      this.addCellBg.setFillStyle(COLORS.BUTTON_BAR_BG);
      this.addCellBorder.lineStyle(2, COLORS.CARD_FOCUSED_BORDER, 1);
      this.addCellBorder.strokeRect(0, 0, this.screenW, CARD_HEIGHT);
    }
  }

  private updateFieldFocus() {
    const card = this.cards[this.cursorIdx];
    if (card) { card.setCardFocus(false); card.setFieldFocus(this.focusedField); }
  }

  // ── Scroll ───────────────────────────────────────────────────────────────────

  private scrollToCard(idx: number) {
    const rowH = CARD_HEIGHT + CARD_GAP;
    const top = idx * rowH;
    const bottom = top + CARD_HEIGHT;
    if (top < -this.viewportY) this.viewportY = -top;
    else if (bottom > this.cardsAreaH - this.viewportY) this.viewportY = this.cardsAreaH - bottom;
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
  }

  // ── Card operations ───────────────────────────────────────────────────────────

  private addCard() {
    const sd = DEFAULT_SPRITE();
    this.sprites.push(sd);
    const newIdx = this.cards.length; // before createCard pushes
    const card = this.createCard(sd, newIdx);
    this.cursorIdx = newIdx;
    this.repositionAddCell();
    this.scrollToCard(this.cursorIdx);
    this.enterFieldMode('name');
    card.activateCurrentField(); // auto-focus name TextInput
  }

  private deleteCard(card: SpriteCard) {
    const idx = this.cards.indexOf(card);
    if (idx < 0) return;
    this.selectedCardIds.delete(card.spriteId);
    card.destroy();
    this.cards.splice(idx, 1);
    this.sprites.splice(idx, 1);
    this.cards.forEach((c, i) => c.setPosition(0, i * (CARD_HEIGHT + CARD_GAP)));
    this.repositionAddCell();
    this.mode = 'card';
    this.cursorIdx = Math.min(this.cursorIdx, Math.max(0, this.cards.length - 1));
    if (this.cards.length === 0) this.cursorIdx = 0;
    this.updateCardFocus();
    this.scrollToCard(this.cursorIdx);
  }

  // ── Button actions ────────────────────────────────────────────────────────────

  private handleButtonAction(key: string) {
    switch (key) {
      case 'back':          this.emit('back');                          break;
      case 'select':        this.enterSelectMode();                     break;
      case 'export':        this.emit('export', this.collectSprites()); break;
      case 'select-cancel': this.exitSelectMode();                      break;
      case 'select-delete': this.deleteSelectedCards();                 break;
    }
  }
}
