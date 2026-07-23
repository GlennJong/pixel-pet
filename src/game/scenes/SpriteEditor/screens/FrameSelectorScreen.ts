import Phaser from 'phaser';
import { GridSelector, GridCellData, ButtonBar, ScreenKeyboard } from '../elements';
import { FocusRouter, createScope, makeFocusable } from '../elements/focus';
import { EditorScreen } from './EditorScreen';
import {
  COLORS,
  BUTTON_BAR_HEIGHT,
  GRID_OUTER_PAD,
} from '../constants';
import { ImageItem } from '../types';

/**
 * S3 – FrameSelectorScreen
 *
 * Grid of all library images above a cancel/confirm bar. Navigation is driven by
 * the shared {@link FocusRouter}: the grid and the bar are two focusables;
 * geometry moves between them and boundary overrides wrap (grid-top ↑ → bar,
 * bar ↓ → grid-top). Space toggles a frame; Enter confirms; Escape cancels.
 *
 * Events emitted:
 *   'cancel'
 *   'confirm' ({ frameIds: string[] })
 */
export class FrameSelectorScreen extends EditorScreen {
  private grid!: GridSelector;
  private buttonBar!: ButtonBar;
  private readonly router = new FocusRouter();

  constructor(
    scene: Phaser.Scene,
    width: number,
    height: number,
    images: ImageItem[],
    currentFrames: string[],
  ) {
    super(scene);

    const buttonBarY = height - BUTTON_BAR_HEIGHT;
    const gridH = buttonBarY - GRID_OUTER_PAD;

    this.add(scene.add.rectangle(0, 0, width, height, COLORS.BG).setOrigin(0, 0));

    // ── Grid ──────────────────────────────────────────────────────────────────
    this.grid = new GridSelector(scene, {
      x: 0,
      y: 0,
      width,
      height: gridH,
      hasAddCell: false,
    });
    this.add(this.grid);

    // Populate cells (no add cell). Look up each image's frame order via a Map
    // built once — indexOf per image would be O(images × frames).
    const orderById = new Map(currentFrames.map((id, i) => [id, i]));
    const cells: GridCellData[] = images.map(img => {
      const frameIdx = orderById.get(img.id) ?? -1;
      return {
        id: img.id,
        type: 'image' as const,
        textureKey: img.textureKey,
        selected: frameIdx >= 0,
        selectionOrder: frameIdx >= 0 ? frameIdx + 1 : undefined,
      };
    });
    this.grid.setCells(cells);

    // ── Button bar ────────────────────────────────────────────────────────────
    this.buttonBar = new ButtonBar(scene, buttonBarY, width, this.buildButtons(currentFrames.length));
    this.buttonBar.on('action', (key: string) => {
      if (key === 'cancel') this.emit('cancel');
      else if (key === 'confirm') this.emit('confirm', { frameIds: this.grid.selectedIds });
    });
    this.add(this.buttonBar);

    this.grid.on('selection-change', (selected: GridCellData[]) => {
      this.buttonBar.setButtons(this.buildButtons(selected.length));
    });

    this.setupFocus();

    // ── Keyboard ──────────────────────────────────────────────────────────────
    this.keyboard = new ScreenKeyboard({
      scene,
      canAttach: () => this.active,
      deferAttach: true,
      onKeyDown: (code: string) => this.router.handleKey(code),
    });

    scene.add.existing(this);
    this.keyboard.attach();
  }

  private setupFocus() {
    const grid = makeFocusable({
      id: 'grid',
      object: this.grid,
      onFocus: (from) => {
        this.grid.activate();
        // Entered from below (up out of the bar) → last row; from above → first.
        if (from === 'UP') this.grid.setCursor(Math.max(0, this.grid.cellCount - 1));
        else if (from === 'DOWN') this.grid.setCursor(0);
      },
      onBlur: () => this.grid.deactivate(),
      onSelect: () => this.grid.activateCurrent(),
      // Enter confirms the whole selection from within the grid.
      handleKey: (code) => {
        if (code !== 'Enter') return false;
        this.emit('confirm', { frameIds: this.grid.selectedIds });
        return true;
      },
      handleDirection: (dir) => {
        switch (dir) {
          case 'LEFT':  this.grid.moveCursorLeft();  return true;
          case 'RIGHT': this.grid.moveCursorRight(); return true;
          case 'UP':    return this.grid.moveCursorUp();   // false at top row → router bridges
          case 'DOWN':  return this.grid.moveCursorDown(); // false at last row → router bridges
          default:      return false;
        }
      },
    });

    const bar = makeFocusable({
      id: 'bar',
      object: this.buttonBar,
      onFocus: () => this.buttonBar.activate(),
      onBlur: () => this.buttonBar.deactivate(),
      onSelect: () => this.buttonBar.executeCursor(),
      handleDirection: (dir) => {
        if (dir === 'LEFT') { this.buttonBar.moveCursor(-1); return true; }
        if (dir === 'RIGHT') { this.buttonBar.moveCursor(1); return true; }
        return false; // UP/DOWN → router move/bridge
      },
    });

    const scope = createScope({
      id: 'frame-selector',
      members: () => [grid, bar],
      onCancel: () => this.emit('cancel'),
      boundaryOverride: {
        UP: () => this.router.focusId('bar'),                                 // grid-top ↑ → bar
        DOWN: () => { this.grid.setCursor(0); this.router.focusId('grid'); }, // bar ↓ → grid-top
      },
    });

    this.router.setBaseScope(scope, 'grid');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private buildButtons(selectedCount: number) {
    return [
      { key: 'cancel', label: 'cancel' },
      { key: 'confirm', label: selectedCount > 0 ? `confirm(${selectedCount})` : 'confirm' },
    ];
  }

  update() { /* event-driven */ }
}
