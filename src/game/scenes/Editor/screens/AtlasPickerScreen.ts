import Phaser from 'phaser';
import { OptionMenu } from '../elements';
import { ScreenKeyboard } from '@/game/ui';
import { FocusRouter, createScope } from '@/game/ui/focus';
import { COLORS, BUTTON_BAR_HEIGHT } from '../constants';
import { NavHost, WorkspaceAtlasEntry } from '../types';
import { EditorScreen } from './EditorScreen';

export interface AtlasPickerOptions {
  /**
   * Root mode drops the dimmed blocker and labels the bottom action EXIT: the
   * screen is not covering anything, so pretending to be a modal would promise
   * a thing to go back to that does not exist.
   */
  root?: boolean;
  initialIndex?: number;
}

/**
 * S0 – pick which shipped atlas to edit.
 *
 * Two roles, one screen: the editor's first screen (`root: true`), and the
 * modal "load other data" overlay reached from the library. The list is the
 * same either way — the editable atlases from `assets.json` — so the two cannot
 * show different things.
 *
 * A scrolling {@link OptionMenu} list above a single action bar. Navigation is
 * driven by the shared {@link FocusRouter}: the list and the bar are two
 * focusables; geometry moves between them and boundary overrides wrap
 * (list-top ↑ → bar, bar ↓ → list-top).
 *
 * Events emitted:
 *   'cancel'                 – EXIT (root) or CANCEL (overlay)
 *   'confirm' ({ atlas })
 */
export class AtlasPickerScreen extends EditorScreen {
  private readonly screenW: number;
  private readonly screenH: number;
  private readonly atlasList: WorkspaceAtlasEntry[];
  private readonly opts: AtlasPickerOptions;

  private optionMenu!: OptionMenu;
  private readonly router = new FocusRouter();
  private readonly navHost: NavHost;

  constructor(
    scene: Phaser.Scene,
    width: number,
    height: number,
    atlasList: WorkspaceAtlasEntry[],
    navHost: NavHost,
    opts: AtlasPickerOptions = {},
  ) {
    super(scene);
    this.navHost = navHost;

    this.screenW = width;
    this.screenH = height;
    this.atlasList = [...atlasList];
    this.opts = opts;

    this.buildUI();
    this.optionMenu.setCursor(opts.initialIndex ?? 0);
    this.setupFocus();
    this.installKeyboard();

    scene.add.existing(this);
    this.keyboard.attach();
  }

  private buildUI() {
    // Opaque as a root screen, dimmed-but-blocking as an overlay.
    const blocker = this.scene.add
      .rectangle(0, 0, this.screenW, this.screenH, COLORS.BG, this.opts.root ? 1 : 0.92)
      .setOrigin(0, 0)
      .setInteractive({ cursor: 'default' });
    blocker.on('pointerdown', () => undefined);
    this.add(blocker);

    // Framed list, leaving room at the bottom for the CANCEL nav bar.
    const listMaxH = this.screenH - BUTTON_BAR_HEIGHT - 4 - 8;
    this.optionMenu = new OptionMenu(
      this.scene,
      8,
      8,
      this.screenW - 16,
      listMaxH,
      // The user picks what they want to change, so the row says what changes:
      // a readable name over a line naming the thing they will see differ. The
      // atlasId is an internal identifier and only surfaces when an entry has
      // no display name of its own.
      this.atlasList.map((atlas, i) => ({
        key: String(i),
        label: `${i + 1}. ${atlas.displayName || atlas.atlasId}`,
        description: atlas.description,
      })),
    );
    this.optionMenu.on('select', (key: string) => this.confirmSelection(Number(key)));
    this.add(this.optionMenu);
  }

  private setupFocus() {
    // Pointer events take router focus first, so mouse and keyboard agree.
    this.optionMenu.on('request-focus', () => this.router.focusId('list'));

    const list = this.optionMenu.asFocusable('list');
    // The bottom bar belongs to the scene — see navigation/registry.ts for its
    // buttons. We only borrow it as a focusable.
    const cancel = this.navHost.buildNavFocusable(
      (edge) => this.router.focusEdge(edge, 'nav'),
      () => this.router.focusId('nav'),
    );

    const scope = createScope({
      id: 'atlas-picker',
      members: () => [list, cancel],
      onCancel: () => this.emit('cancel'),
      boundaryOverride: {
        UP: () => this.router.focusId('nav', 'UP'),     // list-top ↑ → action bar
        DOWN: () => this.router.focusId('list', 'DOWN'), // action bar ↓ → list-top
      },
    });

    this.router.setBaseScope(scope, 'list');
  }

  private installKeyboard() {
    this.keyboard = new ScreenKeyboard({
      scene: this.scene,
      canAttach: () => this.active,
      deferAttach: true,
      onKeyDown: (code: string) => this.router.handleKey(code),
    });
  }

  private confirmSelection(index: number) {
    const atlas = this.atlasList[index];
    if (!atlas) return;
    this.emit('confirm', { atlas });
  }
}
