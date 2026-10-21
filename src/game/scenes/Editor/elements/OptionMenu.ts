import Phaser from 'phaser';
import { Direction } from '@/game/ui/focus';
import { COLORS, FONT_CJK, cjkStyle, hex } from '../constants';
import { FocusableCursorList } from './FocusableCursorList';

export interface OptionMenuItem {
  key: string;
  label: string;
  /**
   * Optional second line, in a dimmer colour. Use it to say what the row
   * *does*, when the label alone is a name rather than an explanation.
   * Giving any item a description makes every row in the list taller, so the
   * rows stay a uniform size.
   */
  description?: string;
}

const ROW_H = 16;
/** Row height once any item carries a description (two stacked text lines). */
const ROW_H_WITH_DESC = 24;
/** Two lines of the 10px dialogue font need a little more room. */
const ROW_H_WITH_DESC_CJK = 26;
const ROW_TEXT_PAD_X = 4;

/**
 * Vertical option list of bordered, selectable rows (e.g. the Library entry
 * menu, or the atlas picker). No outer panel frame — the rows carry their own
 * borders. Shows up to `maxHeight` worth of rows; beyond that the list scrolls,
 * and over-long labels ellipsize. Selection highlights the cursor row.
 *
 * Keyboard is driven by the owning screen via moveCursor()/setCursor()/
 * selectCurrent() (mirrors GridSelector/ButtonBar), so focus stays centralized.
 * The owner handles page/section boundaries (e.g. arrow-down off the last row).
 *
 * Events emitted:
 *   'select' (key: string) – a row was activated
 *   'request-focus'        – pointer entered/pressed; owner should focus this menu
 */
export class OptionMenu extends FocusableCursorList {
  private rowBgs: Phaser.GameObjects.Rectangle[] = [];
  private rowTexts: Phaser.GameObjects.Text[] = [];
  private items: OptionMenuItem[] = [];
  // Ellipsized display strings, computed once per setItems (parallel to `items`).
  // Labels don't change between cursor moves, so refreshVisuals must not rebuild
  // them — it only recolours rows.
  private displayLabels: string[] = [];
  private displayDescs: string[] = [];

  private rowDescs: Phaser.GameObjects.Text[] = [];

  private _cursorIndex = 0;
  private scrollOffset = 0;
  private visibleRows = 1;
  private rowH = ROW_H;
  private maxVisibleRows = 1;

  private readonly maxHeight: number;
  private readonly cjk: boolean;
  private readonly rowWidth: number;
  private readonly rowTextMaxW: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    maxHeight: number,
    items: OptionMenuItem[],
    /** Rows mostly in Chinese: drawn in the dialogue font, rows a little taller. */
    opts: { cjk?: boolean } = {},
  ) {
    super(scene, x, y);
    this.cjk = opts.cjk === true;
    this.maxHeight = maxHeight;
    this.rowWidth = width;
    this.rowTextMaxW = Math.max(10, this.rowWidth - ROW_TEXT_PAD_X * 2);

    scene.add.existing(this);
    this.setItems(items);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get cursorIndex() { return this._cursorIndex; }
  get itemCount() { return this.items.length; }

  setItems(items: OptionMenuItem[]) {
    this.clearRows();
    this.items = [...items];
    // One row height for the whole list: a list of mixed-height rows reads as a
    // layout bug, and the cursor would jump by varying amounts.
    const withDesc = this.cjk ? ROW_H_WITH_DESC_CJK : ROW_H_WITH_DESC;
    this.rowH = this.items.some((item) => item.description) ? withDesc : ROW_H;
    this.maxVisibleRows = Math.max(1, Math.floor(this.maxHeight / this.rowH));
    this.computeDisplayLabels();
    this._cursorIndex = Phaser.Math.Clamp(this._cursorIndex, 0, Math.max(0, items.length - 1));
    this.scrollOffset = 0;

    // Show as many rows as fit; scroll once they exceed maxHeight.
    this.visibleRows = Math.min(this.maxVisibleRows, Math.max(1, items.length));

    const twoLine = this.rowH !== ROW_H;

    for (let i = 0; i < this.visibleRows; i += 1) {
      const rowY = i * this.rowH;
      const bg = this.scene.add
        .rectangle(0, rowY, this.rowWidth, this.rowH - 2, COLORS.GRID_AREA_BG)
        .setOrigin(0, 0)
        .setInteractive({ cursor: 'pointer' });
      const labelY = twoLine ? (this.cjk ? 6 : 5) : this.rowH / 2;
      const descY = this.cjk ? 18 : 15;
      const text = this.scene.add
        .text(ROW_TEXT_PAD_X, rowY + labelY, '', this.textStyle(COLORS.TEXT))
        .setOrigin(0, 0.5);
      const desc = twoLine
        ? this.scene.add
            .text(ROW_TEXT_PAD_X, rowY + descY, '', this.textStyle(COLORS.TEXT_DISABLED))
            .setOrigin(0, 0.5)
        : undefined;

      const rowIndex = i;
      // 'request-focus' first: the owner pulls router focus onto this menu, then
      // we place the cursor on the hovered row.
      bg.on('pointerover', () => {
        const idx = this.scrollOffset + rowIndex;
        if (idx >= this.items.length) return;
        this.emit('request-focus');
        this._cursorIndex = idx;
        this.refreshVisuals();
      });
      bg.on('pointerdown', () => {
        const idx = this.scrollOffset + rowIndex;
        if (idx >= this.items.length) return;
        this.emit('request-focus');
        this._cursorIndex = idx;
        this.selectCurrent();
      });

      this.add(bg);
      this.add(text);
      this.rowBgs.push(bg);
      this.rowTexts.push(text);
      if (desc) {
        this.add(desc);
        this.rowDescs.push(desc);
      }
    }

    this.ensureCursorVisible();
    this.refreshVisuals();
  }

  protected onFocusChange() {
    this.refreshVisuals();
  }

  // ── Cursor contract (see FocusableCursorList.asFocusable) ──────────────────

  protected moveCursorIn(dir: Direction): boolean {
    if (dir === 'UP') {
      if (this._cursorIndex <= 0) return false;
      this.moveCursor(-1);
      return true;
    }
    if (dir === 'DOWN') {
      if (this._cursorIndex >= this.items.length - 1) return false;
      this.moveCursor(1);
      return true;
    }
    return false; // horizontal → the router moves focus out of the list
  }

  protected homeCursor(edge: 'first' | 'last') {
    this.setCursor(edge === 'first' ? 0 : this.items.length - 1);
  }

  protected activateCursor() {
    this.selectCurrent();
  }

  moveCursor(delta: number) {
    if (this.items.length === 0) return;
    this._cursorIndex = Phaser.Math.Clamp(this._cursorIndex + delta, 0, this.items.length - 1);
    this.ensureCursorVisible();
    this.refreshVisuals();
  }

  setCursor(index: number) {
    this._cursorIndex = Phaser.Math.Clamp(index, 0, Math.max(0, this.items.length - 1));
    this.ensureCursorVisible();
    this.refreshVisuals();
  }

  selectCurrent() {
    const item = this.items[this._cursorIndex];
    if (item) this.emit('select', item.key);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private textStyle(color: number): Phaser.Types.GameObjects.Text.TextStyle {
    if (this.cjk) return cjkStyle(color);
    return { fontFamily: FONT_CJK.FAMILY, fontSize: `${FONT_CJK.SIZE}px`, color: hex(color), resolution: FONT_CJK.RESOLUTION };
  }

  private clearRows() {
    this.rowBgs.forEach(b => b.destroy());
    this.rowTexts.forEach(t => t.destroy());
    this.rowDescs.forEach(t => t.destroy());
    this.rowBgs = [];
    this.rowTexts = [];
    this.rowDescs = [];
  }

  private ensureCursorVisible() {
    if (this._cursorIndex < this.scrollOffset) {
      this.scrollOffset = this._cursorIndex;
    }
    if (this._cursorIndex >= this.scrollOffset + this.visibleRows) {
      this.scrollOffset = this._cursorIndex - this.visibleRows + 1;
    }
    const maxOffset = Math.max(0, this.items.length - this.visibleRows);
    this.scrollOffset = Phaser.Math.Clamp(this.scrollOffset, 0, maxOffset);
  }

  private refreshVisuals() {
    const focusedTextColor = hex(COLORS.TEXT_BUTTON);
    const textColor = hex(COLORS.TEXT);
    const dimTextColor = hex(COLORS.TEXT_DISABLED);

    this.rowBgs.forEach((bg, rowIdx) => {
      const itemIdx = this.scrollOffset + rowIdx;
      const item = this.items[itemIdx];
      const text = this.rowTexts[rowIdx];
      const desc = this.rowDescs[rowIdx];
      if (!item || !text) {
        bg.setVisible(false);
        if (text) text.setVisible(false);
        if (desc) desc.setVisible(false);
        return;
      }

      bg.setVisible(true);
      text.setVisible(true);
      desc?.setVisible(true);

      const isCursor = this._hasFocus && itemIdx === this._cursorIndex;
      if (isCursor) {
        bg.setFillStyle(COLORS.BUTTON_FOCUSED_BG);
        bg.setStrokeStyle(1, COLORS.BUTTON_FOCUSED_BORDER, 1);
        text.setColor(focusedTextColor);
      } else {
        bg.setFillStyle(COLORS.GRID_AREA_BG);
        bg.setStrokeStyle(1, COLORS.INPUT_BORDER_DEFAULT, 1);
        text.setColor(textColor);
      }

      // Precomputed; setText early-returns when the value is unchanged, so
      // recolouring a row doesn't re-measure/re-render its (fixed) text.
      text.setText(this.displayLabels[itemIdx] ?? item.label);

      if (desc) {
        desc.setText(this.displayDescs[itemIdx] ?? '');
        // On the cursor row the background is dark, so the dimmed grey would be
        // unreadable; fall back to the same colour as the label.
        desc.setColor(isCursor ? focusedTextColor : dimTextColor);
      }
    });
  }

  /** Compute each item's ellipsized display string once, using a single probe. */
  private computeDisplayLabels() {
    const probe = this.scene.add
      .text(0, 0, '', this.textStyle(COLORS.TEXT))
      .setVisible(false);
    this.displayLabels = this.items.map(item => this.ellipsize(probe, item.label));
    this.displayDescs = this.items.map(item =>
      item.description ? this.ellipsize(probe, item.description) : '',
    );
    probe.destroy();
  }

  private ellipsize(probe: Phaser.GameObjects.Text, value: string): string {
    probe.setText(value);
    if (probe.width <= this.rowTextMaxW) return value;

    const ellipsis = '...';
    let low = 0;
    let high = value.length;
    let best = ellipsis;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = `${value.slice(0, mid)}${ellipsis}`;
      probe.setText(candidate);
      if (probe.width <= this.rowTextMaxW) {
        best = candidate;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return best;
  }
}
