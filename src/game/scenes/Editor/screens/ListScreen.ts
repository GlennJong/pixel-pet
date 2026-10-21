import Phaser from 'phaser';
import { OptionMenuItem } from '../elements';
import { ScrollList } from '../elements/ScrollList';
import { ScreenKeyboard } from '@/game/ui';
import { FocusRouter, createScope } from '@/game/ui/focus';
import { COLORS, BUTTON_BAR_HEIGHT, cjkStyle } from '../constants';
import { NavHost } from '../types';
import { EditorScreen } from './EditorScreen';

export interface ListScreenOptions {
  /** One line above the list saying where the user is ("照顧 › 吃飯"). */
  title?: string;
  /** Key of the row to put the cursor on. Unknown or absent: the first row. */
  focusKey?: string;
  /** Rows whose value Left/Right steps (numbers); others ignore the keys. */
  adjustable?: (key: string) => boolean;
}

const PAD = 8;
const TITLE_H = 14;

/**
 * A titled list above the shared bottom bar — every screen of the basic editor.
 *
 * The screens differ only in their rows and in what choosing one means, and
 * both of those live in navigation/registry.ts. This class knows nothing about
 * actions or configs: it shows rows and reports what the user did.
 *
 * Rows are replaced in place with {@link setItems} after an edit, so the cursor
 * and scroll survive the change instead of the screen being rebuilt.
 *
 * Events emitted:
 *   'select' (key: string)                       – a row was chosen
 *   'adjust' ({ key: string; delta: 1 | -1 })    – Left/Right on an adjustable row
 *   'cancel'                                     – Escape
 */
export class ListScreen extends EditorScreen {
  private readonly menu: ScrollList;
  private readonly router = new FocusRouter();
  private readonly opts: ListScreenOptions;

  constructor(
    scene: Phaser.Scene,
    width: number,
    height: number,
    items: OptionMenuItem[],
    navHost: NavHost,
    opts: ListScreenOptions = {},
  ) {
    super(scene);
    this.opts = opts;

    this.add(scene.add.rectangle(0, 0, width, height, COLORS.BG).setOrigin(0, 0));

    let top = PAD;
    if (opts.title) {
      this.add(scene.add.text(PAD, 3, opts.title, cjkStyle()));
      top = PAD + TITLE_H;
    }

    const listH = height - BUTTON_BAR_HEIGHT - 4 - top;
    this.menu = new ScrollList(scene, PAD, top, width - PAD * 2, listH, items);
    this.menu.on('select', (key: string) => this.emit('select', key));
    this.add(this.menu);

    const start = items.findIndex((i) => i.key === opts.focusKey);
    this.menu.setCursor(Math.max(0, start));
    this.items = items;

    this.setupFocus(navHost);
    this.keyboard = new ScreenKeyboard({
      scene,
      canAttach: () => this.active,
      deferAttach: true,
      onKeyDown: (code: string) => this.router.handleKey(code),
    });

    scene.add.existing(this);
    this.keyboard.attach();
  }

  private items: OptionMenuItem[];

  /** The row under the cursor. */
  get cursorKey(): string | undefined {
    return this.items[this.menu.cursorIndex]?.key;
  }

  /** Replace the rows, keeping the cursor on the same key where it still exists. */
  setItems(items: OptionMenuItem[]) {
    const keep = this.cursorKey;
    this.items = items;
    this.menu.setItems(items);
    const at = items.findIndex((i) => i.key === keep);
    this.menu.setCursor(at >= 0 ? at : this.menu.cursorIndex);
  }

  update() { /* event-driven */ }

  private setupFocus(navHost: NavHost) {
    this.menu.on('request-focus', () => this.router.focusId('list'));

    const list = this.menu.asFocusable('list', {
      handleDirection: (dir) => {
        if (dir !== 'LEFT' && dir !== 'RIGHT') return undefined;
        const key = this.cursorKey;
        if (!key || !this.opts.adjustable?.(key)) return undefined;
        this.emit('adjust', { key, delta: dir === 'RIGHT' ? 1 : -1 });
        return true;
      },
    });
    // The bottom bar belongs to the scene — see navigation/registry.ts.
    const bar = navHost.buildNavFocusable(
      (edge) => this.router.focusEdge(edge, 'nav'),
      () => this.router.focusId('nav'),
    );

    const scope = createScope({
      id: 'list-screen',
      members: () => [list, bar],
      onCancel: () => this.emit('cancel'),
      boundaryOverride: {
        UP: () => this.router.focusId('nav', 'UP'),     // list-top ↑ → bar
        DOWN: () => this.router.focusId('list', 'DOWN'), // bar ↓ → list-top
      },
    });
    this.router.setBaseScope(scope, 'list');
  }
}
