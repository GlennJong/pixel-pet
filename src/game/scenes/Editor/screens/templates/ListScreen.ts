import Phaser from 'phaser';
import { OptionMenuItem, ScrollList } from '../../elements';
import { BUTTON_BAR_HEIGHT, TITLE_HEIGHT } from '../../constants';
import { BaseScreen, NavHost } from '../BaseScreen';

export interface ListScreenOptions {
  /** One line above the list saying where the user is ("照顧 › 吃飯"). */
  title?: string;
  /** Key of the row to put the cursor on. Unknown or absent: the first row. */
  focusKey?: string;
  /** Rows whose value Left/Right steps (numbers); others ignore the keys. */
  adjustable?: (key: string) => boolean;
}

const PAD = 8;

/**
 * A list of rows above the shared bottom bar, optionally titled — the atlas
 * picker, and any screen that is "choose one of these".
 *
 * The screens differ only in their rows and in what choosing one means, and
 * both of those live in navigation/registry.ts. This class knows nothing about
 * atlases or configs: it shows rows and reports what the user did.
 *
 * Rows are replaced in place with {@link setItems} after an edit, so the cursor
 * and scroll survive the change instead of the screen being rebuilt.
 *
 * Events emitted:
 *   'select' (key: string)                       – a row was chosen
 *   'adjust' ({ key: string; delta: 1 | -1 })    – Left/Right on an adjustable row
 *   'cancel'                                     – Escape
 */
export class ListScreen extends BaseScreen {
  private readonly menu: ScrollList;
  private readonly opts: ListScreenOptions;
  private items: OptionMenuItem[];

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
    this.items = items;

    this.addBackground(width, height);

    let top = PAD;
    if (opts.title) {
      this.addTitle(opts.title, PAD, 3);
      top = PAD + TITLE_HEIGHT;
    }

    const listH = height - BUTTON_BAR_HEIGHT - 4 - top;
    this.menu = new ScrollList(scene, PAD, top, width - PAD * 2, listH, items);
    this.menu.on('select', (key: string) => this.emit('select', key));
    this.add(this.menu);

    const start = items.findIndex((i) => i.key === opts.focusKey);
    this.menu.setCursor(Math.max(0, start));

    this.setupFocus(navHost);
    this.listen();
  }

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

  private setupFocus(navHost: NavHost) {
    // Pointer events take router focus first, so mouse and keyboard agree.
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
    this.mountContent({ id: 'list-screen', content: [list], navHost, onCancel: () => this.emit('cancel') });
  }
}
