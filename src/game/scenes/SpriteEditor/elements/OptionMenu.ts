import Phaser from 'phaser';
import { COLORS, FONT, hex } from '../constants';
import { FocusableCursorList } from './FocusableCursorList';

export interface OptionMenuItem {
  key: string;
  label: string;
}

const ROW_H = 16;
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
 */
export class OptionMenu extends FocusableCursorList {
  private rowBgs: Phaser.GameObjects.Rectangle[] = [];
  private rowTexts: Phaser.GameObjects.Text[] = [];
  private items: OptionMenuItem[] = [];
  // Ellipsized display strings, computed once per setItems (parallel to `items`).
  // Labels don't change between cursor moves, so refreshVisuals must not rebuild
  // them — it only recolours rows.
  private displayLabels: string[] = [];

  private _cursorIndex = 0;
  private scrollOffset = 0;
  private visibleRows = 1;

  private readonly maxVisibleRows: number;
  private readonly rowWidth: number;
  private readonly rowTextMaxW: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    maxHeight: number,
    items: OptionMenuItem[],
  ) {
    super(scene, x, y);
    this.maxVisibleRows = Math.max(1, Math.floor(maxHeight / ROW_H));
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
    this.computeDisplayLabels();
    this._cursorIndex = Phaser.Math.Clamp(this._cursorIndex, 0, Math.max(0, items.length - 1));
    this.scrollOffset = 0;

    // Show as many rows as fit; scroll once they exceed maxHeight.
    this.visibleRows = Math.min(this.maxVisibleRows, Math.max(1, items.length));

    for (let i = 0; i < this.visibleRows; i += 1) {
      const rowY = i * ROW_H;
      const bg = this.scene.add
        .rectangle(0, rowY, this.rowWidth, ROW_H - 2, COLORS.GRID_AREA_BG)
        .setOrigin(0, 0)
        .setInteractive({ cursor: 'pointer' });
      const text = this.scene.add
        .text(ROW_TEXT_PAD_X, rowY + ROW_H / 2, '', {
          fontFamily: FONT.FAMILY,
          fontSize: FONT.SIZE,
          color: hex(COLORS.TEXT),
          resolution: 1,
        })
        .setOrigin(0, 0.5);

      const rowIndex = i;
      bg.on('pointerover', () => {
        const idx = this.scrollOffset + rowIndex;
        if (idx >= this.items.length) return;
        this._cursorIndex = idx;
        this.refreshVisuals();
      });
      bg.on('pointerdown', () => {
        const idx = this.scrollOffset + rowIndex;
        if (idx >= this.items.length) return;
        this._cursorIndex = idx;
        this.selectCurrent();
      });

      this.add(bg);
      this.add(text);
      this.rowBgs.push(bg);
      this.rowTexts.push(text);
    }

    this.ensureCursorVisible();
    this.refreshVisuals();
  }

  protected onFocusChange() {
    this.refreshVisuals();
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

  private clearRows() {
    this.rowBgs.forEach(b => b.destroy());
    this.rowTexts.forEach(t => t.destroy());
    this.rowBgs = [];
    this.rowTexts = [];
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

    this.rowBgs.forEach((bg, rowIdx) => {
      const itemIdx = this.scrollOffset + rowIdx;
      const item = this.items[itemIdx];
      const text = this.rowTexts[rowIdx];
      if (!item || !text) {
        bg.setVisible(false);
        if (text) text.setVisible(false);
        return;
      }

      bg.setVisible(true);
      text.setVisible(true);

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
    });
  }

  /** Compute each item's ellipsized display string once, using a single probe. */
  private computeDisplayLabels() {
    const probe = this.scene.add
      .text(0, 0, '', { fontFamily: FONT.FAMILY, fontSize: FONT.SIZE, resolution: 1 })
      .setVisible(false);
    this.displayLabels = this.items.map(item => this.ellipsize(probe, item.label));
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
