import Phaser from 'phaser';
import { GridSelector, GridCellData, ButtonBar } from '../elements';
import { ScreenKeyboard } from '@/game/ui';
import { FocusRouter, createScope } from '@/game/ui/focus';
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
    // Pointer events take router focus first, so mouse and keyboard agree.
    this.grid.on('request-focus', () => this.router.focusId('grid'));
    this.buttonBar.on('request-focus', () => this.router.focusId('bar'));

    const grid = this.grid.asFocusable('grid', {
      // Enter confirms the whole selection from within the grid.
      handleKey: (code) => {
        if (code !== 'Enter') return false;
        this.emit('confirm', { frameIds: this.grid.selectedIds });
        return true;
      },
    });

    const bar = this.buttonBar.asFocusable('bar', { homeOnEnter: 'none' });

    const scope = createScope({
      id: 'frame-selector',
      members: () => [grid, bar],
      onCancel: () => this.emit('cancel'),
      boundaryOverride: {
        UP: () => this.router.focusId('bar', 'UP'),     // grid-top ↑ → bar
        DOWN: () => this.router.focusId('grid', 'DOWN'), // bar ↓ → grid-top
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
