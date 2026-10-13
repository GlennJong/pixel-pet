import Phaser from 'phaser';
import { COLORS, FONT, GRID_COLS, GRID_GAP, GRID_OUTER_PAD, hex } from '../constants';
import { Direction } from '@/game/ui/focus';
import { fitContainNoUpscale, resolveTextureSourceSize } from '../utils/sizing';
import { FocusableCursorList } from './FocusableCursorList';

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
 *   'request-focus'            – pointer entered/pressed; owner should focus this grid
 *   'selection-change' (cells) – selection state changed
 */
export class GridSelector extends FocusableCursorList {
  private areaBg!: Phaser.GameObjects.Rectangle;
  private contentContainer!: Phaser.GameObjects.Container;
  private viewportMask!: Phaser.GameObjects.Graphics;

  private cells: GridCellData[] = [];
  private cellContainers: Phaser.GameObjects.Container[] = [];

  private _cursorIndex = 0;
  private _prevCursorIndex = 0; // last styled cursor, for incremental cursor moves
  private viewportOffsetY = 0; // ≤ 0; negative means scrolled down

  private readonly cellSize: number;
  private readonly visibleH: number;
  /** The grid's own size, kept for focus routing — see focusBounds(). */
  private readonly viewW: number;
  private readonly viewH: number;

  constructor(scene: Phaser.Scene, config: GridSelectorConfig) {
    super(scene, config.x, config.y);

    const cols = GRID_COLS;
    const innerW = config.width - GRID_OUTER_PAD * 2;
    this.cellSize = config.cellSize ?? Math.floor((innerW - (cols - 1) * GRID_GAP) / cols);
    this.visibleH = config.height - GRID_OUTER_PAD * 2;
    this.viewW = config.width;
    this.viewH = config.height;

    // Gray background area
    this.areaBg = scene.add
      .rectangle(0, 0, config.width, config.height, COLORS.GRID_AREA_BG)
      .setOrigin(0, 0);
    this.add(this.areaBg);

    // Content container – scrolls vertically
    this.contentContainer = scene.add.container(GRID_OUTER_PAD, GRID_OUTER_PAD);
    this.add(this.contentContainer);

    // Clip scrolling content to the grid area so partially-scrolled rows don't
    // bleed over neighbouring UI (e.g. the name input above). The mask lives in
    // world space; the grid sits at (config.x, config.y) under a screen container
    // anchored at the origin.
    this.viewportMask = scene.make.graphics({}, false);
    this.viewportMask.fillStyle(0xffffff);
    this.viewportMask.fillRect(config.x, config.y, config.width, config.height);
    this.contentContainer.setMask(this.viewportMask.createGeometryMask());

    scene.add.existing(this);
  }

  /**
   * Route by the visible area, not by the content.
   *
   * `getBounds()` on the container spans every cell, including those scrolled
   * out of sight. A library of any size therefore reports a rectangle reaching
   * far below the grid, putting its centre *below* the bottom bar — and a
   * neighbour that is not above you cannot be reached by pressing up.
   */
  protected focusBounds(): Phaser.Geom.Rectangle {
    const origin = this.getWorldTransformMatrix();
    return new Phaser.Geom.Rectangle(origin.tx, origin.ty, this.viewW, this.viewH);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

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

  protected onFocusChange() {
    this.refreshVisuals();
  }

  // ── Cursor contract (see FocusableCursorList.asFocusable) ──────────────────

  protected moveCursorIn(dir: Direction): boolean {
    if (dir === 'LEFT')  { this.moveCursorLeft();  return true; } // wraps in-row
    if (dir === 'RIGHT') { this.moveCursorRight(); return true; }
    if (dir === 'UP')    return this.moveCursorUp();   // false at the top row
    return this.moveCursorDown();                      // false at the last row
  }

  protected homeCursor(edge: 'first' | 'last') {
    this.setCursor(edge === 'first' ? 0 : Math.max(0, this.cells.length - 1));
  }

  protected activateCursor() {
    this.activateCurrent();
  }

  /** Add the special '+' cell at the end */
  initAddCell() {
    this.cells.push({ id: '__add__', type: 'add', selected: false });
    this.rebuildCellViews();
    this.refreshVisuals();
  }

  /**
   * Bulk-insert multiple image cells before the add-cell. Inserts only the new
   * containers and shifts the trailing ones — no full grid rebuild.
   */
  prependImageCells(images: { id: string; textureKey: string }[]) {
    if (images.length === 0) return;
    const insertIdx = this.insertionIndex();
    const newCells: GridCellData[] = images.map(img => ({
      id: img.id, type: 'image' as const, textureKey: img.textureKey, selected: false,
    }));
    this.cells.splice(insertIdx, 0, ...newCells);
    const views = newCells.map((cell, k) => this.createCellView(cell, insertIdx + k));
    this.cellContainers.splice(insertIdx, 0, ...views);
    this.repositionFrom(insertIdx);
    this.refreshVisuals();
  }

  /** Add a new image cell before the add-cell (incremental — no full rebuild). */
  addImageCell(data: { id: string; textureKey: string }) {
    const insertIdx = this.insertionIndex();
    const cell: GridCellData = { id: data.id, type: 'image', textureKey: data.textureKey, selected: false };
    this.cells.splice(insertIdx, 0, cell);
    const view = this.createCellView(cell, insertIdx);
    this.cellContainers.splice(insertIdx, 0, view);
    this.repositionFrom(insertIdx);
    this.refreshVisuals();
  }

  removeCellById(id: string) {
    const idx = this.cells.findIndex(c => c.id === id);
    if (idx < 0) return;
    this.cells.splice(idx, 1);
    const [view] = this.cellContainers.splice(idx, 1);
    view.exclusive = true;
    view.destroy();
    this.renumberSelections();
    this._cursorIndex = Math.min(this._cursorIndex, Math.max(0, this.cells.length - 1));
    this.repositionFrom(idx);
    this.scrollToCursor();
    this.refreshVisuals();
  }

  /** Index at which a new image cell is inserted (before the add-cell, if any). */
  private insertionIndex(): number {
    const addIdx = this.cells.findIndex(c => c.type === 'add');
    return addIdx >= 0 ? addIdx : this.cells.length;
  }

  /** Reposition existing cell containers from `startIndex` onward (cheap move). */
  private repositionFrom(startIndex: number) {
    for (let i = Math.max(0, startIndex); i < this.cellContainers.length; i += 1) {
      const pos = this.cellPosition(i);
      this.cellContainers[i].setPosition(pos.x, pos.y);
    }
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
    // A replacement list can be shorter than the last one; a cursor left past
    // the end would index undefined on the next redraw.
    this._cursorIndex = Phaser.Math.Clamp(this._cursorIndex, 0, Math.max(0, this.cells.length - 1));
    this.rebuildCellViews();
    this.scrollToCursor();
    this.refreshVisuals();
  }

  // ── Cursor navigation (return value indicates whether move happened) ────────

  /** Returns false if already in first row → caller should navigate to element above */
  moveCursorUp(): boolean {
    if (Math.floor(this._cursorIndex / GRID_COLS) === 0) return false;
    this._cursorIndex -= GRID_COLS;
    this.scrollToCursor();
    this.refreshCursor();
    return true;
  }

  /** Returns false if already in last row → caller should navigate to element below */
  moveCursorDown(): boolean {
    const lastRow = Math.floor((this.cells.length - 1) / GRID_COLS);
    if (Math.floor(this._cursorIndex / GRID_COLS) >= lastRow) return false;
    this._cursorIndex = Math.min(this._cursorIndex + GRID_COLS, this.cells.length - 1);
    this.scrollToCursor();
    this.refreshCursor();
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
    this.refreshCursor();
  }

  moveCursorRight() {
    if (this.cells.length === 0) return;
    const row = Math.floor(this._cursorIndex / GRID_COLS);
    const rowStart = row * GRID_COLS;
    const rowEnd = Math.min(rowStart + GRID_COLS - 1, this.cells.length - 1);
    this._cursorIndex = this._cursorIndex >= rowEnd ? rowStart : this._cursorIndex + 1;
    this.refreshCursor();
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
    this.cellContainers = this.cells.map((cell, i) => this.createCellView(cell, i));
  }

  /** Build the view for a single cell at position `index`. */
  private createCellView(cell: GridCellData, index: number): Phaser.GameObjects.Container {
    const pos = this.cellPosition(index);
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
          color: hex(COLORS.TEXT),
        })
        .setOrigin(0.5);
      container.add(plus);
    } else if (cell.textureKey && this.scene.textures.exists(cell.textureKey)) {
      const source = resolveTextureSourceSize(this.scene, cell.textureKey);
      const fitted = source
        ? fitContainNoUpscale(source.width, source.height, this.cellSize - 4, this.cellSize - 4)
        : { width: this.cellSize - 4, height: this.cellSize - 4 };
      const img = this.scene.add
        .image(this.cellSize / 2, this.cellSize / 2, cell.textureKey)
        .setOrigin(0.5)
        .setDisplaySize(fitted.width, fitted.height);
      container.add(img);
    }

    // Selection-order badge (top-right)
    const badge = this.scene.add
      .text(this.cellSize - 2, 2, '', {
        fontFamily: FONT.FAMILY,
        fontSize: FONT.SIZE,
        color: hex(COLORS.BADGE_TEXT),
        backgroundColor: hex(COLORS.BADGE_BG),
        padding: { x: 2, y: 1 },
      })
      .setOrigin(1, 0)
      .setVisible(false);
    container.add(badge);
    container.setData('badge', badge);

    // Mouse interaction. Resolve the live index at event time — cells are
    // inserted/removed incrementally, so a captured index would go stale.
    // 'request-focus' first: the owner pulls router focus onto this grid, then we
    // place the cursor on the hovered cell.
    bg.on('pointerover', () => {
      const idx = this.cellContainers.indexOf(container);
      if (idx < 0) return;
      this.emit('request-focus');
      this._cursorIndex = idx;
      this.refreshCursor();
    });
    bg.on('pointerdown', () => {
      const idx = this.cellContainers.indexOf(container);
      if (idx < 0) return;
      this.emit('request-focus');
      this._cursorIndex = idx;
      this.activateCurrent();
    });

    this.contentContainer.add(container);
    return container;
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

  /** Full restyle of every cell + viewport clip. Use after structural or
   *  selection changes; for a pure cursor move use {@link refreshCursor}. */
  private refreshVisuals() {
    for (let i = 0; i < this.cellContainers.length; i += 1) this.styleCell(i);
    this.clipVisibility();
    this._prevCursorIndex = this._cursorIndex;
  }

  /** Incremental update for a cursor move: restyle only the two cells whose
   *  focus changed, then re-clip (a move may have scrolled the viewport). */
  private refreshCursor() {
    this.styleCell(this._prevCursorIndex);
    this.styleCell(this._cursorIndex);
    this._prevCursorIndex = this._cursorIndex;
    this.clipVisibility();
  }

  /** Restyle a single cell's fill / border / badge. */
  private styleCell(i: number) {
    const container = this.cellContainers[i];
    const cell = this.cells[i];
    if (!container || !cell) return; // guard against stale indices
    const bg = container.getData('bg') as Phaser.GameObjects.Rectangle | undefined;
    const border = container.getData('border') as Phaser.GameObjects.Graphics | undefined;
    const badge = container.getData('badge') as Phaser.GameObjects.Text | undefined;
    if (!bg || !border || !badge) return;

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
  }

  /** Hide cells scrolled outside the viewport. */
  private clipVisibility() {
    this.cellContainers.forEach((container, i) => {
      const pos = this.cellPosition(i);
      const localTop = this.viewportOffsetY + pos.y;
      const localBottom = localTop + this.cellSize;
      container.setVisible(localBottom > 0 && localTop < this.visibleH);
    });
  }

  destroy(fromScene?: boolean) {
    this.contentContainer?.clearMask(true);
    this.viewportMask?.destroy();
    super.destroy(fromScene);
  }
}
