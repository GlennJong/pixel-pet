import Phaser from 'phaser';
import { COLORS, FONT, GRID_COLS, GRID_GAP, GRID_OUTER_PAD } from '../constants';

export interface GridCellData {
  id: string;
  type: 'image' | 'add';
  textureKey?: string;
  selected: boolean;
  selectionOrder?: number; // 1-indexed order of selection (undefined when not selected)
}

export interface GridSelectorConfig {
  x: number;
  y: number;
  width: number;
  height: number; // visible height
  hasAddCell?: boolean;
  cellSize?: number;
}

/**
 * 4-column thumbnail grid with keyboard cursor navigation.
 * Supports image cells and one optional '+' add cell at the end.
 * Selected cells show a badge with selection order.
 * Cursor scrolls the viewport row by row.
 *
 * Events emitted:
 *   'add-request'              – '+' cell was activated
 *   'selection-change' (cells) – selection state changed
 */
export class GridSelector extends Phaser.GameObjects.Container {
  private areaBg!: Phaser.GameObjects.Rectangle;
  private contentContainer!: Phaser.GameObjects.Container;

  private cells: GridCellData[] = [];
  private cellContainers: Phaser.GameObjects.Container[] = [];

  private _cursorIndex = 0;
  private _hasFocus = false;
  private viewportOffsetY = 0; // ≤ 0; negative means scrolled down

  private readonly cellSize: number;
  private readonly visibleH: number;

  constructor(scene: Phaser.Scene, config: GridSelectorConfig) {
    super(scene, config.x, config.y);

    const cols = GRID_COLS;
    const innerW = config.width - GRID_OUTER_PAD * 2;
    this.cellSize = config.cellSize ?? Math.floor((innerW - (cols - 1) * GRID_GAP) / cols);
    this.visibleH = config.height - GRID_OUTER_PAD * 2;

    // Gray background area
    this.areaBg = scene.add
      .rectangle(0, 0, config.width, config.height, COLORS.GRID_AREA_BG)
      .setOrigin(0, 0);
    this.add(this.areaBg);

    // Content container – scrolls vertically
    this.contentContainer = scene.add.container(GRID_OUTER_PAD, GRID_OUTER_PAD);
    this.add(this.contentContainer);

    scene.add.existing(this);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get hasFocus() { return this._hasFocus; }
  get cursorIndex() { return this._cursorIndex; }
  get cellCount() { return this.cells.length; }

  /** Data of the cell currently under the cursor (undefined if empty) */
  getCursorCell(): GridCellData | undefined {
    return this.cells[this._cursorIndex];
  }

  /** IDs of selected cells in selection order */
  get selectedIds(): string[] {
    return this.cells
      .filter(c => c.selected)
      .sort((a, b) => (a.selectionOrder ?? 0) - (b.selectionOrder ?? 0))
      .map(c => c.id);
  }

  activate() {
    this._hasFocus = true;
    this.refreshVisuals();
  }

  deactivate() {
    this._hasFocus = false;
    this.refreshVisuals();
  }

  /** Add the special '+' cell at the end */
  initAddCell() {
    this.cells.push({ id: '__add__', type: 'add', selected: false });
    this.rebuildCellViews();
    this.refreshVisuals();
  }

  /**
   * Bulk-insert multiple image cells before the add-cell (single rebuild).
   * Use this instead of calling addImageCell in a loop.
   */
  prependImageCells(images: { id: string; textureKey: string }[]) {
    if (images.length === 0) return;
    const addIdx = this.cells.findIndex(c => c.type === 'add');
    const newCells: GridCellData[] = images.map(img => ({
      id: img.id, type: 'image' as const, textureKey: img.textureKey, selected: false,
    }));
    if (addIdx >= 0) {
      this.cells.splice(addIdx, 0, ...newCells);
    } else {
      this.cells.push(...newCells);
    }
    this.rebuildCellViews();
    this.refreshVisuals();
  }

  /** Add a new image cell before the add-cell */
  addImageCell(data: { id: string; textureKey: string }) {
    const addIdx = this.cells.findIndex(c => c.type === 'add');
    const cell: GridCellData = { id: data.id, type: 'image', textureKey: data.textureKey, selected: false };
    if (addIdx >= 0) {
      this.cells.splice(addIdx, 0, cell);
    } else {
      this.cells.push(cell);
    }
    this.rebuildCellViews();
    this.refreshVisuals();
  }

  removeCellById(id: string) {
    const idx = this.cells.findIndex(c => c.id === id);
    if (idx < 0) return;
    this.cells.splice(idx, 1);
    this.renumberSelections();
    this._cursorIndex = Math.min(this._cursorIndex, Math.max(0, this.cells.length - 1));
    this.rebuildCellViews();
    this.scrollToCursor();
    this.refreshVisuals();
  }

  setCursor(index: number) {
    this._cursorIndex = Phaser.Math.Clamp(index, 0, Math.max(0, this.cells.length - 1));
    this.scrollToCursor();
    this.refreshVisuals();
  }

  clearAllSelections() {
    this.cells.forEach(c => { c.selected = false; c.selectionOrder = undefined; });
    this.refreshVisuals();
  }

  /** Replace all cells (used by S3 to show images without add cell) */
  setCells(cells: GridCellData[]) {
    this.cells = cells.map(c => ({ ...c }));
    this.rebuildCellViews();
    this.refreshVisuals();
  }

  // ── Cursor navigation (return value indicates whether move happened) ────────

  /** Returns false if already in first row → caller should navigate to element above */
  moveCursorUp(): boolean {
    if (Math.floor(this._cursorIndex / GRID_COLS) === 0) return false;
    this._cursorIndex -= GRID_COLS;
    this.scrollToCursor();
    this.refreshVisuals();
    return true;
  }

  /** Returns false if already in last row → caller should navigate to element below */
  moveCursorDown(): boolean {
    const lastRow = Math.floor((this.cells.length - 1) / GRID_COLS);
    if (Math.floor(this._cursorIndex / GRID_COLS) >= lastRow) return false;
    this._cursorIndex = Math.min(this._cursorIndex + GRID_COLS, this.cells.length - 1);
    this.scrollToCursor();
    this.refreshVisuals();
    return true;
  }

  /** Left / Right wrap within the same row */
  moveCursorLeft() {
    if (this.cells.length === 0) return;
    const row = Math.floor(this._cursorIndex / GRID_COLS);
    const col = this._cursorIndex % GRID_COLS;
    const rowStart = row * GRID_COLS;
    const rowEnd = Math.min(rowStart + GRID_COLS - 1, this.cells.length - 1);
    this._cursorIndex = col === 0 ? rowEnd : rowStart + col - 1;
    this.refreshVisuals();
  }

  moveCursorRight() {
    if (this.cells.length === 0) return;
    const row = Math.floor(this._cursorIndex / GRID_COLS);
    const rowStart = row * GRID_COLS;
    const rowEnd = Math.min(rowStart + GRID_COLS - 1, this.cells.length - 1);
    this._cursorIndex = this._cursorIndex >= rowEnd ? rowStart : this._cursorIndex + 1;
    this.refreshVisuals();
  }

  /** Space / click handler for current cursor cell */
  activateCurrent() {
    const cell = this.cells[this._cursorIndex];
    if (!cell) return;
    if (cell.type === 'add') {
      this.emit('add-request');
    } else {
      this.toggleSelection(this._cursorIndex);
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private toggleSelection(index: number) {
    const cell = this.cells[index];
    if (!cell || cell.type === 'add') return;

    if (cell.selected) {
      const removed = cell.selectionOrder ?? 0;
      cell.selected = false;
      cell.selectionOrder = undefined;
      // Compact order numbers
      this.cells.forEach(c => {
        if (c.selected && (c.selectionOrder ?? 0) > removed) {
          c.selectionOrder = (c.selectionOrder ?? 0) - 1;
        }
      });
    } else {
      const maxOrder = Math.max(0, ...this.cells.filter(c => c.selected).map(c => c.selectionOrder ?? 0));
      cell.selected = true;
      cell.selectionOrder = maxOrder + 1;
    }

    this.refreshVisuals();
    this.emit('selection-change', this.cells.filter(c => c.selected));
  }

  private renumberSelections() {
    const selected = this.cells
      .filter(c => c.selected)
      .sort((a, b) => (a.selectionOrder ?? 0) - (b.selectionOrder ?? 0));
    selected.forEach((c, i) => { c.selectionOrder = i + 1; });
  }

  private cellPosition(index: number): { x: number; y: number } {
    return {
      x: (index % GRID_COLS) * (this.cellSize + GRID_GAP),
      y: Math.floor(index / GRID_COLS) * (this.cellSize + GRID_GAP),
    };
  }

  private rebuildCellViews() {
    // `exclusive=true` ensures Container.preDestroy destroys all children,
    // removing their interactive bindings from the input system and preventing
    // orphaned bg rectangles from causing double-toggle on click.
    this.cellContainers.forEach(c => { c.exclusive = true; c.destroy(); });
    this.cellContainers = [];

    this.cells.forEach((cell, i) => {
      const pos = this.cellPosition(i);
      const container = this.scene.add.container(pos.x, pos.y);
      container.exclusive = true; // children are destroyed with the container

      // Background tile
      const bg = this.scene.add
        .rectangle(0, 0, this.cellSize, this.cellSize, COLORS.CELL)
        .setOrigin(0, 0)
        .setInteractive({ cursor: 'pointer' });
      container.add(bg);
      container.setData('bg', bg);

      // Focus / selected border
      const border = this.scene.add.graphics();
      container.add(border);
      container.setData('border', border);

      if (cell.type === 'add') {
        const plus = this.scene.add
          .text(this.cellSize / 2, this.cellSize / 2, '+', {
            fontFamily: FONT.FAMILY,
            fontSize: FONT.SIZE,
            color: '#' + COLORS.TEXT.toString(16).padStart(6, '0'),
          })
          .setOrigin(0.5);
        container.add(plus);
      } else if (cell.textureKey && this.scene.textures.exists(cell.textureKey)) {
        const img = this.scene.add
          .image(this.cellSize / 2, this.cellSize / 2, cell.textureKey)
          .setOrigin(0.5)
          .setDisplaySize(this.cellSize - 4, this.cellSize - 4);
        container.add(img);
      }

      // Selection-order badge (top-right)
      const badge = this.scene.add
        .text(this.cellSize - 2, 2, '', {
          fontFamily: FONT.FAMILY,
          fontSize: FONT.SIZE_SM,
          color: '#' + COLORS.BADGE_TEXT.toString(16).padStart(6, '0'),
          backgroundColor: '#' + COLORS.BADGE_BG.toString(16).padStart(6, '0'),
          padding: { x: 2, y: 1 },
        })
        .setOrigin(1, 0)
        .setVisible(false);
      container.add(badge);
      container.setData('badge', badge);

      // Mouse interaction
      bg.on('pointerover', () => {
        this._cursorIndex = i;
        this.refreshVisuals();
      });
      bg.on('pointerdown', () => {
        this._cursorIndex = i;
        this.activateCurrent();
      });

      this.contentContainer.add(container);
      this.cellContainers.push(container);
    });
  }

  private scrollToCursor() {
    if (this.cellContainers.length === 0) return;
    const rowH = this.cellSize + GRID_GAP;
    const row = Math.floor(this._cursorIndex / GRID_COLS);
    const cellTop = row * rowH;
    const cellBottom = cellTop + this.cellSize;

    // Scroll up if cursor is above visible area
    if (cellTop < -this.viewportOffsetY) {
      this.viewportOffsetY = -cellTop;
    }
    // Scroll down if cursor is below visible area
    if (cellBottom > this.visibleH - this.viewportOffsetY) {
      this.viewportOffsetY = this.visibleH - cellBottom;
    }
    this.contentContainer.setY(GRID_OUTER_PAD + this.viewportOffsetY);
  }

  private refreshVisuals() {
    this.cellContainers.forEach((container, i) => {
      const cell = this.cells[i];
      const bg = container.getData('bg') as Phaser.GameObjects.Rectangle | undefined;
      const border = container.getData('border') as Phaser.GameObjects.Graphics | undefined;
      const badge = container.getData('badge') as Phaser.GameObjects.Text | undefined;
      if (!bg || !border || !badge || !cell) return; // guard against stale containers

      // Background fill
      bg.setFillStyle(cell.selected ? COLORS.CELL_SELECTED_BG : COLORS.CELL);

      // Border
      border.clear();
      if (this._hasFocus && i === this._cursorIndex) {
        border.lineStyle(2, COLORS.CELL_FOCUSED_BORDER, 1);
        border.strokeRect(0, 0, this.cellSize, this.cellSize);
      } else if (cell.selected) {
        border.lineStyle(1, COLORS.CELL_SELECTED_BORDER, 1);
        border.strokeRect(0, 0, this.cellSize, this.cellSize);
      }

      // Badge
      if (cell.selected && cell.selectionOrder !== undefined) {
        badge.setText(String(cell.selectionOrder)).setVisible(true);
      } else {
        badge.setVisible(false);
      }

      // Visibility clipping (hide cells outside scroll viewport)
      const pos = this.cellPosition(i);
      const localTop = this.viewportOffsetY + pos.y;
      const localBottom = localTop + this.cellSize;
      container.setVisible(localBottom > 0 && localTop < this.visibleH);
    });
  }
}
