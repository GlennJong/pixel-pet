import Phaser from 'phaser';
import { GridSelector } from '../elements';
import { ScreenKeyboard } from '@/game/ui';
import { FocusRouter, createScope } from '@/game/ui/focus';
import { COLORS, BUTTON_BAR_HEIGHT, GRID_OUTER_PAD, cjkStyle } from '../constants';
import { NavHost } from '../types';
import { EditorScreen } from './EditorScreen';

const TITLE_H = 14;

export interface PreviewCell {
  id: string;
  /** Shown in the title while the cursor is on this cell. */
  label?: string;
  /** Played in order, looping. */
  parts: string[];
}

/**
 * Choose by watching: a grid where every cell plays its animation.
 *
 * Used twice — the items of a catalog group (each playing its performance),
 * and the animations of the atlas (when picking one part). Cells carry no
 * text; the title names whatever the cursor is on, when the cell has a name.
 *
 * Events emitted:
 *   'pick' (id: string)
 *   'cancel'
 */
export class PreviewGridScreen extends EditorScreen {
  private readonly router = new FocusRouter();
  private readonly grid: GridSelector;
  private readonly titleText: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    width: number,
    height: number,
    title: string,
    atlasId: string,
    cells: PreviewCell[],
    opts: { focusId?: string; markedId?: string },
    navHost: NavHost,
  ) {
    super(scene);
    this.add(scene.add.rectangle(0, 0, width, height, COLORS.BG).setOrigin(0, 0));
    this.titleText = scene.add.text(3, 2, title, cjkStyle());
    this.add(this.titleText);

    this.grid = new GridSelector(scene, {
      x: 0,
      y: TITLE_H,
      width,
      height: height - BUTTON_BAR_HEIGHT - TITLE_H - GRID_OUTER_PAD,
      pickOne: true,
    });
    this.grid.setCells(cells.map((c) => ({
      id: c.id,
      type: 'image' as const,
      // The marked cell is the current choice, badged so it is easy to find.
      selected: c.id === opts.markedId,
      selectionOrder: c.id === opts.markedId ? 1 : undefined,
      animation: { atlasId, parts: c.parts },
    })));
    this.grid.on('pick', (id: string) => this.emit('pick', id));
    this.grid.on('cursor-change', (i: number) => {
      const label = cells[i]?.label;
      this.titleText.setText(label ? `${title} › ${label}` : title);
    });
    this.add(this.grid);
    const start = cells.findIndex((c) => c.id === (opts.focusId ?? opts.markedId));
    this.grid.setCursor(Math.max(0, start));

    this.grid.on('request-focus', () => this.router.focusId('grid'));
    const grid = this.grid.asFocusable('grid', {
      homeOnEnter: 'none',
      // Coming back to the grid from the bar is landing on that cell again.
      onFocus: () => this.grid.replayCursorPreview(),
    });
    const bar = navHost.buildNavFocusable(
      (edge) => this.router.focusEdge(edge, 'grid'),
      () => this.router.focusId('nav'),
    );
    this.router.setBaseScope(createScope({
      id: 'preview-grid',
      members: () => [grid, bar],
      onCancel: () => this.emit('cancel'),
      boundaryOverride: {
        UP: () => this.router.focusId('nav', 'UP'),
        DOWN: () => this.router.focusId('grid', 'DOWN'),
      },
    }), 'grid');

    this.keyboard = new ScreenKeyboard({
      scene,
      canAttach: () => this.active,
      deferAttach: true,
      onKeyDown: (code: string) => this.router.handleKey(code),
    });
    scene.add.existing(this);
    this.keyboard.attach();
  }

  update() { /* event-driven */ }
}
