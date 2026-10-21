import Phaser from 'phaser';
import { GridSelector } from '../../elements';
import { BUTTON_BAR_HEIGHT, GRID_OUTER_PAD, TITLE_HEIGHT } from '../../constants';
import { BaseScreen, NavHost } from '../BaseScreen';

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
export class PreviewGridScreen extends BaseScreen {
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
    this.addBackground(width, height);
    this.titleText = this.addTitle(title);

    this.grid = new GridSelector(scene, {
      x: 0,
      y: TITLE_HEIGHT,
      width,
      height: height - BUTTON_BAR_HEIGHT - TITLE_HEIGHT - GRID_OUTER_PAD,
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
    this.mountContent({ id: 'preview-grid', content: [grid], navHost, onCancel: () => this.emit('cancel') });
    this.listen();
  }

  /** In-order mode: the ticked cells, in the order they were ticked. */
  get selectedIds(): string[] { return this.grid.selectedIds; }
}
