import Phaser from 'phaser';
import { TextInput, GridSelector, ButtonBar, ScreenKeyboard } from '../components';
import { parseSmartFileName } from '../utils/smartInput';
import {
  COLORS,
  FONT,
  BUTTON_BAR_HEIGHT,
  TEXT_INPUT_HEIGHT,
  GRID_OUTER_PAD,
} from '../constants';
import { ImageItem, LibraryFocusSection } from '../types';

const BUTTONS_DEFAULT = [{ key: 'next', label: 'Next' }];
const buttonsWithSelection = (n: number) => [
  { key: 'cancel', label: 'cancel' },
  { key: 'delete', label: n > 0 ? `delete(${n})` : 'delete' },
];

/**
 * S1 – LibraryScreen
 *
 * Layout (top → bottom):
 *   [name input]
 *   [grid selector with thumbnails + '+' add cell]
 *   [button bar]
 *
 * Focus sections: 'text-input' | 'grid' | 'button-bar'
 *
 * Events emitted:
 *   'proceed' ({ projectName, images }) – [Next] validated and passed
 */
export class LibraryScreen extends Phaser.GameObjects.Container {
  private nameInput: TextInput;
  private grid: GridSelector;
  private buttonBar: ButtonBar;
  private errorText: Phaser.GameObjects.Text;

  private focusSection: LibraryFocusSection = 'text-input';
  private images: ImageItem[] = [];
  private nextImageId = 1;

  // Hidden file input – the only allowed DOM element
  private fileInput: HTMLInputElement;

  private keyboard!: ScreenKeyboard;

  constructor(scene: Phaser.Scene, width: number, height: number, initialState?: { projectName: string; images: ImageItem[] }) {
    super(scene, 0, 0);

    const PAD = 8;
    const inputY = PAD;
    const buttonBarY = height - BUTTON_BAR_HEIGHT;
    const gridY = inputY + TEXT_INPUT_HEIGHT + GRID_OUTER_PAD;
    const gridH = buttonBarY - gridY - GRID_OUTER_PAD;

    // ── Background ────────────────────────────────────────────────────────────
    const bg = scene.add.rectangle(0, 0, width, height, COLORS.BG).setOrigin(0, 0);
    this.add(bg);

    // ── Name input ────────────────────────────────────────────────────────────
    this.nameInput = new TextInput(scene, {
      x: PAD,
      y: inputY,
      width: width - PAD * 2,
      height: TEXT_INPUT_HEIGHT,
      variant: 'standalone',
      placeholder: 'name',
      initialValue: initialState?.projectName,
    });
    this.add(this.nameInput);

    // ── Grid ──────────────────────────────────────────────────────────────────
    this.grid = new GridSelector(scene, {
      x: 0,
      y: gridY,
      width,
      height: gridH,
      hasAddCell: true,
    });
    this.add(this.grid);
    this.grid.initAddCell();
    // Restore previously imported images if returning from S2
    if (initialState && initialState.images.length > 0) {
      this.images = [...initialState.images];
      this.nextImageId = initialState.images.reduce((max, img) => {
        const n = parseInt(img.id.replace('img_', ''), 10);
        return isNaN(n) ? max : Math.max(max, n + 1);
      }, 1);
      this.grid.prependImageCells(initialState.images.map(img => ({ id: img.id, textureKey: img.textureKey })));
    }
    // ── Button bar ────────────────────────────────────────────────────────────
    this.buttonBar = new ButtonBar(scene, buttonBarY, width, BUTTONS_DEFAULT);
    this.add(this.buttonBar);

    // ── Error hint ────────────────────────────────────────────────────────────
    this.errorText = scene.add.text(PAD, buttonBarY - 2, '', {
      fontFamily: FONT.FAMILY,
      fontSize: FONT.SIZE_SM,
      color: '#' + COLORS.ERROR.toString(16).padStart(6, '0'),
    }).setOrigin(0, 1).setVisible(false);
    this.add(this.errorText);

    // ── File input (single DOM exception) ────────────────────────────────────
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'image/png,image/jpeg,image/gif,image/webp';
    this.fileInput.multiple = true;
    this.fileInput.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:0;height:0;';
    document.body.appendChild(this.fileInput);
    this.fileInput.addEventListener('change', () => this.handleFileSelect());

    // ── Component event wiring ────────────────────────────────────────────────
    this.nameInput.on('confirm', () => this.transitionToGrid());
    this.nameInput.on('cancel', () => this.transitionToGrid());
    this.nameInput.on('nav-down', () => this.transitionToGrid());
    this.nameInput.on('nav-up', () => this.nameInput.focus());

    this.grid.on('add-request', () => this.fileInput.click());
    this.grid.on('selection-change', (selected: any[]) => {
      this.updateButtonsForSelection(selected.length);
    });

    this.buttonBar.on('action', (key: string) => this.handleButtonAction(key));

    // ── Keyboard ──────────────────────────────────────────────────────────────
    this.keyboard = new ScreenKeyboard({
      scene,
      canAttach: () => this.active,
      shouldHandleKeyDown: () => !this.nameInput.isFocused,
      onKeyDown: (code: string) => this.handleNavKey(code),
    });
    this.keyboard.attach();

    scene.add.existing(this);

    // Start with name input focused
    this.nameInput.focus();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Call from EditorScene.update() if polling-based updates are needed */
  update() {
    // Currently keyboard-event driven; placeholder for future use
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  private handleNavKey(code: string) {
    if (this.focusSection === 'grid') {
      switch (code) {
        case 'ArrowLeft':
          this.grid.moveCursorLeft();
          break;
        case 'ArrowRight':
          this.grid.moveCursorRight();
          break;
        case 'ArrowUp': {
          const moved = this.grid.moveCursorUp();
          if (!moved) this.transitionToTextInput();
          break;
        }
        case 'ArrowDown': {
          const moved = this.grid.moveCursorDown();
          if (!moved) this.transitionToButtonBar();
          break;
        }
        case 'Space':
          this.grid.activateCurrent();
          break;
        case 'Escape':
          this.grid.clearAllSelections();
          this.updateButtonsForSelection(0);
          break;
      }
    } else if (this.focusSection === 'button-bar') {
      switch (code) {
        case 'ArrowLeft':
          this.buttonBar.moveCursor(-1);
          break;
        case 'ArrowRight':
          this.buttonBar.moveCursor(1);
          break;
        case 'ArrowUp':
          this.transitionToGrid(/* lastRow */ true);
          break;
        case 'Space':
          this.buttonBar.executeCursor();
          break;
        case 'Escape':
          this.grid.clearAllSelections();
          this.updateButtonsForSelection(0);
          this.transitionToGrid(true);
          break;
      }
    }
  }

  // ── Section transitions ────────────────────────────────────────────────────

  private transitionToTextInput() {
    this.grid.deactivate();
    this.focusSection = 'text-input';
    this.nameInput.focus();
  }

  private transitionToGrid(lastRow = false) {
    if (this.focusSection === 'text-input') {
      this.nameInput.blur();
    } else if (this.focusSection === 'button-bar') {
      this.buttonBar.deactivate();
    }
    this.focusSection = 'grid';
    this.grid.activate();
    if (lastRow) {
      // Move cursor to last row
      const total = this.grid.cellCount;
      if (total > 0) {
        const lastIdx = total - 1;
        this.grid.setCursor(lastIdx);
      }
    } else {
      this.grid.setCursor(0);
    }
  }

  private transitionToButtonBar() {
    this.grid.deactivate();
    this.focusSection = 'button-bar';
    this.buttonBar.activate();
    this.buttonBar.setCursorToFirst();
  }

  // ── Button actions ─────────────────────────────────────────────────────────

  private handleButtonAction(key: string) {
    switch (key) {
      case 'next': {
        const name = this.nameInput.value.trim();
        if (!name) {
          this.showError('Name cannot be empty');
          return;
        }
        if (this.images.length === 0) {
          this.showError('Add at least one image');
          return;
        }
        this.errorText.setVisible(false);
        this.emit('proceed', { projectName: name, images: [...this.images] });
        break;
      }
      case 'cancel':
        this.grid.clearAllSelections();
        this.updateButtonsForSelection(0);
        break;
      case 'delete': {
        const toDelete = this.grid.selectedIds;
        toDelete.forEach(id => {
          this.grid.removeCellById(id);
          this.images = this.images.filter(img => img.id !== id);
        });
        this.autoFillProjectNameFromParsedImages();
        this.grid.clearAllSelections();
        this.updateButtonsForSelection(0);
        break;
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private updateButtonsForSelection(count: number) {
    if (count > 0) {
      this.buttonBar.setButtons(buttonsWithSelection(count));
    } else {
      this.buttonBar.setButtons(BUTTONS_DEFAULT);
    }
  }

  private showError(msg: string) {
    this.errorText.setText(msg).setVisible(true);
    this.scene.time.delayedCall(2500, () => {
      if (this.errorText?.active) this.errorText.setVisible(false);
    });
  }

  // ── File import ────────────────────────────────────────────────────────────

  private handleFileSelect() {
    const files = this.fileInput.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const dataUrl = evt.target?.result as string | undefined;
        if (!dataUrl) return;
        this.importImageFromDataUrl(dataUrl, file.name);
      };
      reader.readAsDataURL(file);
    });

    // Reset so the same file can be re-selected
    this.fileInput.value = '';
  }

  private importImageFromDataUrl(dataUrl: string, fileName: string) {
    const id = `img_${this.nextImageId++}`;
    const textureKey = `editor_img_${id}`;

    // addBase64 is async; listen for completion before creating the cell
    this.scene.textures.addBase64(textureKey, dataUrl);
    this.scene.textures.once(`addtexture-${textureKey}`, () => {
      const frame = this.scene.textures.getFrame(textureKey);
      const item: ImageItem = {
        id,
        fileName,
        textureKey,
        width: frame.realWidth,
        height: frame.realHeight,
      };
      this.images.push(item);
      this.autoFillProjectNameFromParsedImages();
      this.grid.addImageCell({ id, textureKey });
    });
  }

  private autoFillProjectNameFromParsedImages() {
    const keyCounts = new Map<string, number>();

    this.images.forEach(image => {
      const parsed = parseSmartFileName(image.fileName);
      if (!parsed) return;
      keyCounts.set(parsed.key, (keyCounts.get(parsed.key) ?? 0) + 1);
    });

    if (keyCounts.size === 0) return;

    const sorted = Array.from(keyCounts.entries()).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });

    const [bestKey] = sorted[0];
    if (bestKey && this.nameInput.value !== bestKey) {
      this.nameInput.setValue(bestKey);
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  destroy(fromScene?: boolean) {
    this.keyboard.destroy();
    if (this.fileInput.parentNode) {
      this.fileInput.parentNode.removeChild(this.fileInput);
    }
    super.destroy(fromScene);
  }
}
