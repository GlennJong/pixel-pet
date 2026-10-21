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
 * Choose by watching: a grid where every cell plays its animation. Cells carry
 * no text; the title names whatever the cursor is on, when the cell has a name.
 *
 * Two modes:
 *   pick one – Enter picks the cell (the items of a group; a portrait).
 *   in order – Enter ticks cells, numbered in the order ticked, and the order
 *              is the answer (the parts of a performance). Ticked cells come
 *              first, so the current answer is what the grid opens on.
 *
 * Events emitted:
 *   'pick' (id: string)   – pick-one mode
 *   'selection-change'    – in-order mode
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
    opts: {
      focusId?: string;
      /** Pick one: the current choice, badged. */
      markedId?: string;
      /** In order: the current answer, ticked and numbered. Turns the mode on. */
      ordered?: string[];
    },
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
      pickOne: !opts.ordered,
    });
    const order = opts.ordered ?? (opts.markedId ? [opts.markedId] : []);
    const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : Number.MAX_SAFE_INTEGER);
    if (opts.ordered) cells = [...cells].sort((a, b) => rank(a.id) - rank(b.id));
    this.grid.setCells(cells.map((c) => ({
      id: c.id,
      type: 'image' as const,
      selected: order.includes(c.id),
      selectionOrder: order.includes(c.id) ? order.indexOf(c.id) + 1 : undefined,
      animation: { atlasId, parts: c.parts },
    })));
    this.grid.on('pick', (id: string) => this.emit('pick', id));
    this.grid.on('selection-change', () => this.emit('selection-change'));
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

  /** In-order mode: the ticked cells, in the order they were ticked. */
  get selectedIds(): string[] { return this.grid.selectedIds; }

  update() { /* event-driven */ }
}
