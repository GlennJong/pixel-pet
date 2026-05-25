import Phaser from 'phaser';
import { ScreenKeyboard } from '../components';
import { COLORS, FONT } from '../constants';
import { WorkspaceAtlasEntry } from '../types';

/**
 * S1 modal overlay – pick an existing workspace atlas to import.
 *
 * Events emitted:
 *   'cancel'
 *   'confirm' ({ atlas })
 */
export class AtlasImportScreen extends Phaser.GameObjects.Container {
  private readonly screenW: number;
  private readonly screenH: number;
  private readonly atlasList: WorkspaceAtlasEntry[];

  private readonly rowH = 16;
  private readonly listX = 10;
  private readonly listY = 10;
  private readonly listW: number;
  private readonly rowTextMaxW: number;
  private readonly visibleRows: number;

  private listContainer!: Phaser.GameObjects.Container;
  private rowBgs: Phaser.GameObjects.Rectangle[] = [];
  private rowTexts: Phaser.GameObjects.Text[] = [];

  private keyboard!: ScreenKeyboard;

  private cursorIdx = 0;
  private scrollOffset = 0;

  constructor(
    scene: Phaser.Scene,
    width: number,
    height: number,
    atlasList: WorkspaceAtlasEntry[],
    initialIndex = 0,
  ) {
    super(scene, 0, 0);

    this.screenW = width;
    this.screenH = height;
    this.atlasList = [...atlasList];
    this.cursorIdx = Phaser.Math.Clamp(initialIndex, 0, Math.max(0, this.atlasList.length - 1));

    this.listW = Math.max(40, this.screenW - this.listX * 2);
    const listH = Math.max(40, this.screenH - this.listY * 2);
    this.rowTextMaxW = Math.max(20, this.listW - 10);
    this.visibleRows = Math.max(1, Math.floor(listH / this.rowH));

    this.buildUI();
    this.installKeyboard();

    scene.add.existing(this);

    this.ensureCursorVisible();
    this.refreshRows();
    this.keyboard.attach();
  }

  private buildUI() {
    const textColor = '#' + COLORS.TEXT.toString(16).padStart(6, '0');

    const blocker = this.scene.add
      .rectangle(0, 0, this.screenW, this.screenH, COLORS.BG, 0.92)
      .setOrigin(0, 0)
      .setInteractive({ cursor: 'default' });
    blocker.on('pointerdown', () => undefined);
    this.add(blocker);

    const panel = this.scene.add
      .rectangle(8, 8, this.screenW - 16, this.screenH - 16, COLORS.CARD_BG)
      .setOrigin(0, 0);
    panel.setStrokeStyle(1, COLORS.INPUT_BORDER_DEFAULT, 1);
    this.add(panel);

    this.listContainer = this.scene.add.container(this.listX, this.listY);
    this.add(this.listContainer);

    for (let i = 0; i < this.visibleRows; i += 1) {
      const y = i * this.rowH;
      const bg = this.scene.add
        .rectangle(0, y, this.listW, this.rowH - 2, COLORS.GRID_AREA_BG)
        .setOrigin(0, 0)
        .setInteractive({ cursor: 'pointer' });

      const text = this.scene.add.text(4, y + 2, '', {
        fontFamily: FONT.FAMILY,
        fontSize: FONT.SIZE,
        color: textColor,
      });

      bg.on('pointerover', () => {
        const listIdx = this.scrollOffset + i;
        if (listIdx >= this.atlasList.length) return;
        this.cursorIdx = listIdx;
        this.refreshRows();
      });

      bg.on('pointerdown', () => {
        const listIdx = this.scrollOffset + i;
        if (listIdx >= this.atlasList.length) return;
        this.cursorIdx = listIdx;
        this.confirmSelection();
      });

      this.listContainer.add(bg);
      this.listContainer.add(text);

      this.rowBgs.push(bg);
      this.rowTexts.push(text);
    }
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
    switch (code) {
      case 'ArrowUp':
        this.setCursor(this.cursorIdx - 1);
        break;
      case 'ArrowDown':
        this.setCursor(this.cursorIdx + 1);
        break;
      case 'Space':
      case 'Enter':
        this.confirmSelection();
        break;
      case 'Escape':
        this.emit('cancel');
        break;
    }
  }

  private setCursor(index: number) {
    this.cursorIdx = Phaser.Math.Clamp(index, 0, Math.max(0, this.atlasList.length - 1));
    this.ensureCursorVisible();
    this.refreshRows();
  }

  private ensureCursorVisible() {
    if (this.cursorIdx < this.scrollOffset) {
      this.scrollOffset = this.cursorIdx;
    }
    if (this.cursorIdx >= this.scrollOffset + this.visibleRows) {
      this.scrollOffset = this.cursorIdx - this.visibleRows + 1;
    }

    const maxOffset = Math.max(0, this.atlasList.length - this.visibleRows);
    this.scrollOffset = Phaser.Math.Clamp(this.scrollOffset, 0, maxOffset);
  }

  private refreshRows() {
    const focusedTextColor = '#' + COLORS.TEXT_BUTTON.toString(16).padStart(6, '0');
    const textColor = '#' + COLORS.TEXT.toString(16).padStart(6, '0');

    this.rowBgs.forEach((bg, rowIdx) => {
      const atlasIdx = this.scrollOffset + rowIdx;
      const atlas = this.atlasList[atlasIdx];
      const text = this.rowTexts[rowIdx];
      if (!atlas || !text) return;

      const isCursor = atlasIdx === this.cursorIdx;

      bg.setVisible(true);
      text.setVisible(true);

      if (isCursor) {
        bg.setFillStyle(COLORS.BUTTON_BG);
        bg.setStrokeStyle(1, COLORS.BUTTON_FOCUSED_BORDER, 1);
        text.setColor(focusedTextColor);
      } else {
        bg.setFillStyle(COLORS.GRID_AREA_BG);
        bg.setStrokeStyle(1, COLORS.INPUT_BORDER_DEFAULT, 1);
        text.setColor(textColor);
      }

      this.setEllipsizedText(text, `${atlasIdx + 1}. ${atlas.atlasId}`);
    });

    for (let rowIdx = this.atlasList.length - this.scrollOffset; rowIdx < this.visibleRows; rowIdx += 1) {
      if (rowIdx < 0) continue;
      const bg = this.rowBgs[rowIdx];
      const text = this.rowTexts[rowIdx];
      if (!bg || !text) continue;
      bg.setVisible(false);
      text.setVisible(false);
    }
  }

  private setEllipsizedText(textObj: Phaser.GameObjects.Text, value: string) {
    textObj.setText(value);
    if (textObj.width <= this.rowTextMaxW) return;

    const ellipsis = '...';
    let low = 0;
    let high = value.length;
    let best = ellipsis;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = `${value.slice(0, mid)}${ellipsis}`;
      textObj.setText(candidate);

      if (textObj.width <= this.rowTextMaxW) {
        best = candidate;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    textObj.setText(best);
  }

  private confirmSelection() {
    const atlas = this.atlasList[this.cursorIdx];
    if (!atlas) return;
    this.emit('confirm', { atlas });
  }

  destroy(fromScene?: boolean) {
    this.keyboard.destroy();
    super.destroy(fromScene);
  }
}
