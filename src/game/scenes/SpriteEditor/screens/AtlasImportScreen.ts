import Phaser from 'phaser';
import { ButtonBar, OptionMenu } from '../elements';
import { ScreenKeyboard } from '@/game/ui';
import { FocusRouter, createScope } from '@/game/ui/focus';
import { COLORS, BUTTON_BAR_HEIGHT } from '../constants';
import { WorkspaceAtlasEntry } from '../types';
import { EditorScreen } from './EditorScreen';

/**
 * S1 modal overlay – pick an existing workspace atlas to import.
 *
 * A scrolling {@link OptionMenu} list above a single CANCEL bar. Navigation is
 * driven by the shared {@link FocusRouter}: the list and the bar are two
 * focusables; geometry moves between them and boundary overrides wrap
 * (list-top ↑ → CANCEL, CANCEL ↓ → list-top).
 *
 * Events emitted:
 *   'cancel'
 *   'confirm' ({ atlas })
 */
export class AtlasImportScreen extends EditorScreen {
  private readonly screenW: number;
  private readonly screenH: number;
  private readonly atlasList: WorkspaceAtlasEntry[];

  private optionMenu!: OptionMenu;
  private buttonBar!: ButtonBar;
  private readonly router = new FocusRouter();

  constructor(
    scene: Phaser.Scene,
    width: number,
    height: number,
    atlasList: WorkspaceAtlasEntry[],
    initialIndex = 0,
  ) {
    super(scene);

    this.screenW = width;
    this.screenH = height;
    this.atlasList = [...atlasList];

    this.buildUI();
    this.optionMenu.setCursor(initialIndex);
    this.setupFocus();
    this.installKeyboard();

    scene.add.existing(this);
    this.keyboard.attach();
  }

  private buildUI() {
    const blocker = this.scene.add
      .rectangle(0, 0, this.screenW, this.screenH, COLORS.BG, 0.92)
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
      this.atlasList.map((atlas, i) => ({ key: String(i), label: `${i + 1}. ${atlas.atlasId}` })),
    );
    this.optionMenu.on('select', (key: string) => this.confirmSelection(Number(key)));
    this.add(this.optionMenu);

    // Bottom nav: a single CANCEL action (Escape also cancels via the scope).
    this.buttonBar = new ButtonBar(
      this.scene,
      this.screenH - BUTTON_BAR_HEIGHT,
      this.screenW,
      [{ key: 'cancel', label: 'CANCEL' }],
    );
    this.buttonBar.on('action', () => this.emit('cancel'));
    this.add(this.buttonBar);
  }

  private setupFocus() {
    // Pointer events take router focus first, so mouse and keyboard agree.
    this.optionMenu.on('request-focus', () => this.router.focusId('list'));
    this.buttonBar.on('request-focus', () => this.router.focusId('cancel'));

    const list = this.optionMenu.asFocusable('list');
    const cancel = this.buttonBar.asFocusable('cancel', { homeOnEnter: 'none' });

    const scope = createScope({
      id: 'atlas-import',
      members: () => [list, cancel],
      onCancel: () => this.emit('cancel'),
      boundaryOverride: {
        UP: () => this.router.focusId('cancel', 'UP'),   // list-top ↑ → CANCEL
        DOWN: () => this.router.focusId('list', 'DOWN'), // CANCEL ↓ → list-top
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
