import Phaser from 'phaser';
import { GridSelector, GridCellData } from '../components/GridSelector';
import { ButtonBar } from '../components/ButtonBar';
import {
  COLORS,
  BUTTON_BAR_HEIGHT,
  GRID_OUTER_PAD,
} from '../constants';
import { ImageItem } from '../types';

/**
 * S3 – FrameSelectorScreen
 *
 * Grid of all library images. Pre-selects the target sprite's current frames
 * (with badges showing order). Space toggles selection. Corner shows a
 * magnified preview of the cell under the cursor.
 *
 * Events emitted:
 *   'cancel'            – Esc / cancel button
 *   'confirm' ({ frameIds: string[] }) – confirm button with ordered selection
 */
export class FrameSelectorScreen extends Phaser.GameObjects.Container {
  private grid!: GridSelector;
  private buttonBar!: ButtonBar;

  private _buttonBarFocused = false;

  private heldKeys = new Set<string>();
  private navKeydownHandler!: (e: KeyboardEvent) => void;
  private navKeyupHandler!: (e: KeyboardEvent) => void;

  constructor(
    scene: Phaser.Scene,
    width: number,
    height: number,
    images: ImageItem[],
    currentFrames: string[],
  ) {
    super(scene, 0, 0);

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

    // Populate cells (no add cell)
    const cells: GridCellData[] = images.map(img => {
      const frameIdx = currentFrames.indexOf(img.id);
      return {
        id: img.id,
        type: 'image' as const,
        textureKey: img.textureKey,
        selected: frameIdx >= 0,
        selectionOrder: frameIdx >= 0 ? frameIdx + 1 : undefined,
      };
    });
    this.grid.setCells(cells);
    this.grid.activate();

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

    // ── Keyboard ──────────────────────────────────────────────────────────────
    this.navKeydownHandler = (e: KeyboardEvent) => {
      if (this.heldKeys.has(e.code)) return;
      this.heldKeys.add(e.code);
      this.handleNavKey(e.code);
    };
    this.navKeyupHandler = (e: KeyboardEvent) => this.heldKeys.delete(e.code);

    scene.add.existing(this);
    // Defer by one frame to avoid consuming the key-press that opened this screen
    scene.time.delayedCall(0, () => {
      if (!this.active) return;
      scene.input.keyboard!.on('keydown', this.navKeydownHandler);
      scene.input.keyboard!.on('keyup', this.navKeyupHandler);
    });
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  private handleNavKey(code: string) {
    if (this._buttonBarFocused) {
      switch (code) {
        case 'ArrowLeft':  this.buttonBar.moveCursor(-1); break;
        case 'ArrowRight': this.buttonBar.moveCursor(1);  break;
        case 'Space':      this.buttonBar.executeCursor(); break;
        case 'ArrowUp':
          this._buttonBarFocused = false;
          this.buttonBar.deactivate();
          this.grid.activate();
          break;
        case 'Escape': this.emit('cancel'); break;
      }
      return;
    }

    switch (code) {
      case 'ArrowLeft':  this.grid.moveCursorLeft();  break;
      case 'ArrowRight': this.grid.moveCursorRight(); break;
      case 'ArrowUp':    this.grid.moveCursorUp();    break;
      case 'ArrowDown': {
        const moved = this.grid.moveCursorDown();
        if (!moved) {
          this._buttonBarFocused = true;
          this.grid.deactivate();
          this.buttonBar.activate();
        }
        break;
      }
      case 'Space':  this.grid.activateCurrent(); break;
      case 'Escape': this.emit('cancel');          break;
      case 'Enter':  this.emit('confirm', { frameIds: this.grid.selectedIds }); break;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private buildButtons(selectedCount: number) {
    return [
      { key: 'cancel', label: 'cancel' },
      { key: 'confirm', label: selectedCount > 0 ? `confirm(${selectedCount})` : 'confirm' },
    ];
  }

  update() { /* event-driven */ }

  destroy(fromScene?: boolean) {
    this.scene.input.keyboard!.off('keydown', this.navKeydownHandler);
    this.scene.input.keyboard!.off('keyup', this.navKeyupHandler);
    super.destroy(fromScene);
  }
}
