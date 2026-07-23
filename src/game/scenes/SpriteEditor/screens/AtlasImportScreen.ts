import Phaser from 'phaser';
import { ScreenKeyboard, ButtonBar, handleButtonBarKey, OptionMenu } from '../elements';
import { COLORS, BUTTON_BAR_HEIGHT } from '../constants';
import { WorkspaceAtlasEntry } from '../types';
import { EditorScreen } from './EditorScreen';

/**
 * S1 modal overlay – pick an existing workspace atlas to import.
 *
 * Uses the shared {@link OptionMenu} for the list (framed, scrolling, ellipsized)
 * plus a CANCEL nav bar. Arrow-down off the bottom of the list moves focus to
 * CANCEL; Escape also cancels.
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

  private focusSection: 'list' | 'button-bar' = 'list';

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
    this.optionMenu.activate();
    this.add(this.optionMenu);

    // Bottom nav: a single CANCEL action (Escape also cancels via keyboard).
    this.buttonBar = new ButtonBar(
      this.scene,
      this.screenH - BUTTON_BAR_HEIGHT,
      this.screenW,
      [{ key: 'cancel', label: 'CANCEL' }],
    );
    this.buttonBar.on('action', () => this.emit('cancel'));
    this.add(this.buttonBar);
  }

  private installKeyboard() {
    this.keyboard = new ScreenKeyboard({
      scene: this.scene,
      canAttach: () => this.active,
      deferAttach: true,
      onKeyDown: (code: string) => this.handleNavKey(code),
    });
  }

  private handleNavKey(code: string) {
    if (this.focusSection === 'button-bar') {
      handleButtonBarKey(this.buttonBar, code, {
        onExitUp: () => this.focusList(),
        onEscape: () => this.emit('cancel'),
      });
      return;
    }

    switch (code) {
      case 'ArrowUp':
        this.optionMenu.moveCursor(-1);
        break;
      case 'ArrowDown':
        // Off the bottom of the list → move focus to the CANCEL nav.
        if (this.optionMenu.cursorIndex >= this.optionMenu.itemCount - 1) this.focusButtonBar();
        else this.optionMenu.moveCursor(1);
        break;
      case 'Space':
      case 'Enter':
        this.optionMenu.selectCurrent();
        break;
      case 'Escape':
        this.emit('cancel');
        break;
    }
  }

  private focusButtonBar() {
    this.focusSection = 'button-bar';
    this.optionMenu.deactivate();
    this.buttonBar.activate();
    this.buttonBar.setCursorToFirst();
  }

  private focusList() {
    this.focusSection = 'list';
    this.buttonBar.deactivate();
    this.optionMenu.activate();
  }

  private confirmSelection(index: number) {
    const atlas = this.atlasList[index];
    if (!atlas) return;
    this.emit('confirm', { atlas });
  }
}
