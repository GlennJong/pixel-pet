import Phaser from 'phaser';
import {
  SpriteCard,
  CardField,
  CARD_FIELDS,
  ButtonBar,
  ScreenKeyboard,
} from '../components';
import {
  COLORS,
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
  { key: 'back',   label: '↩'   },
  { key: 'add',    label: '+'  },
  { key: 'select', label: 'Select'   },
  { key: 'apply',  label: 'Apply' },
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
    this.buttonBarY = height - BUTTON_BAR_HEIGHT;
    this.cardsAreaH = this.buttonBarY - CARD_AREA_PAD;
    this.images = images;
    this.sprites = sprites;

    this.buildUI();
    this.installKeyboard();
    scene.add.existing(this);
    if (this.cards.length === 0) this.focusButtonBar(true);
    if (this.sprites.length === 0) this.addCard();
    else this.updateCardFocus();
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

  collectSprites(): SpriteData[] { return this.cards.map(c => c.spriteData); }

  update() { /* event-driven */ }

  destroy(fromScene?: boolean) {
    this.keyboard.destroy();
    super.destroy(fromScene);
  }

  // ── Build ───────────────────────────────────────────────────────────────────

  private buildUI() {
    this.add(this.scene.add.rectangle(0, 0, this.screenW, this.screenH, COLORS.BG).setOrigin(0, 0));

    this.cardsContainer = this.scene.add.container(0, CARD_AREA_PAD);
    this.add(this.cardsContainer);

    this.sprites.forEach((sd, i) => this.createCard(sd, i));

    this.buttonBar = new ButtonBar(this.scene, this.buttonBarY, this.screenW, BUTTONS_DEFAULT);
    this.buttonBar.on('action', (key: string) => this.handleButtonAction(key));
    this.add(this.buttonBar);
  }

  private createCard(spriteData: SpriteData, index: number): SpriteCard {
    const y = index * (CARD_HEIGHT + CARD_GAP);
    const card = new SpriteCard(this.scene, 0, y, this.screenW, spriteData, this.images);
    this.cardsContainer.add(card);
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
      this.focusedField = field;
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
    this.keyboard = new ScreenKeyboard({
      scene: this.scene,
      canAttach: () => this.active,
      deferAttach: true,
      shouldHandleKeyDown: () => !(this.mode === 'field' && this.cards[this.cursorIdx]?.isTextInputActive),
      onKeyDown: (code: string) => {
        if (this.selectMode) { this.handleSelectModeKey(code); return; }
        if (this.mode === 'card') this.handleCardModeKey(code);
        else if (this.mode === 'button-bar') this.handleButtonBarModeKey(code);
        else this.handleFieldModeKey(code);
      },
    });
    this.keyboard.attach();
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
          this.focusButtonBar(true);
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
    const lastCardIdx = this.cards.length - 1;
    switch (code) {
      case 'ArrowUp':
        if (this.cursorIdx > 0) { this.cursorIdx--; this.updateCardFocus(); this.scrollToCard(this.cursorIdx); }
        break;
      case 'ArrowDown':
        if (this.cursorIdx < lastCardIdx) { this.cursorIdx++; this.updateCardFocus(); this.scrollToCard(this.cursorIdx); }
        else { this.focusButtonBar(true); }
        break;
      case 'ArrowRight':
        if (this.cards.length > 0) this.enterFieldMode('name');
        break;
      case 'Space':
        if (this.cards.length > 0) this.enterFieldMode('name');
        else this.focusButtonBar(true);
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
        if (this.cards.length === 0) break;
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
        this.exitFieldMode();
        break;

      case 'ArrowRight':
        if (isPreview) { this.focusedField = 'name'; this.updateFieldFocus(); }
        else if (isNum) card.incrementField();
        break;

      case 'ArrowLeft':
        if (isNum) card.decrementField();
        else if (isPreview) this.exitFieldMode();
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
          // At last field ('repeatDelay'): jump to next card's first field
          this.cursorIdx++;
          this.focusedField = CARD_FIELDS[0];
          this.updateCardFocus();
          this.updateFieldFocus();
          this.scrollToCard(this.cursorIdx);
        } else {
          // No next card: move naturally to the button bar below
          this.focusButtonBar(true);
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
    this.buttonBar.deactivate();
    this.updateCardFocus();
    this.updateFieldFocus();
  }

  private focusButtonBar(resetCursor = false) {
    this.mode = 'button-bar';
    this.buttonBar.activate();
    if (resetCursor) {
      this.buttonBar.setCursorToFirst();
      if (!this.selectMode) this.buttonBar.moveCursor(1);
    }
    this.updateCardFocus();
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
    this.buttonBar.setButtons(BUTTONS_SELECT(0));
    this.cursorIdx = Math.min(this.cursorIdx, Math.max(0, this.cards.length - 1));
    this.updateCardFocus();
  }

  private exitSelectMode() {
    this.selectMode = false;
    this.selectedCardIds.clear();
    this.cards.forEach(c => c.setSelectState(false));
    this.buttonBar.setButtons(BUTTONS_DEFAULT);
    this.cursorIdx = Math.min(this.cursorIdx, Math.max(0, this.cards.length - 1));
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
    this.cards.forEach((c, i) => {
      c.setCardFocus(i === this.cursorIdx && this.mode === 'card');
      if (this.mode !== 'field' || i !== this.cursorIdx) c.setFieldFocus(null);
    });
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
      case 'add':           this.addCard();                             break;
      case 'select':        this.enterSelectMode();                     break;
      case 'apply':         this.emit('apply', this.collectSprites());  break;
      case 'export':        this.emit('export', this.collectSprites()); break;
      case 'select-cancel': this.exitSelectMode();                      break;
      case 'select-delete': this.deleteSelectedCards();                 break;
    }
  }
}
