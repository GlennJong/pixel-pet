import Phaser from 'phaser';
import { TextInput, GridSelector, ButtonBar, ScreenKeyboard } from '../components';
import { AtlasImportScreen } from './AtlasImportScreen';
import { importAtlasTrio, ImportAtlasTrioResult } from '../utils/import';
import { parseSmartFileName } from '../utils/smartInput';
import {
  COLORS,
  FONT,
  BUTTON_BAR_HEIGHT,
  TEXT_INPUT_HEIGHT,
  GRID_OUTER_PAD,
} from '../constants';
import {
  ImageItem,
  LibraryFocusSection,
  LibraryProceedPayload,
  SpriteData,
  WorkspaceAtlasEntry,
} from '../types';

const BUTTONS_DEFAULT = [
  { key: 'import-local', label: 'import' },
  { key: 'import-workspace', label: 'atlas' },
  { key: 'next', label: 'Next' },
];
const buttonsWithSelection = (n: number) => [
  { key: 'cancel', label: 'cancel' },
  { key: 'delete', label: n > 0 ? `delete(${n})` : 'delete' },
];

interface LocalAtlasTrio {
  png: File;
  spritesheetJson: File;
  animationsJson?: File;
}

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
 *   'proceed' ({ projectName, images, sprites? }) – [Next] validated and passed
 */
export class LibraryScreen extends Phaser.GameObjects.Container {
  private readonly screenW: number;
  private readonly screenH: number;

  private nameInput: TextInput;
  private grid: GridSelector;
  private buttonBar: ButtonBar;
  private errorText: Phaser.GameObjects.Text;

  private focusSection: LibraryFocusSection = 'text-input';
  private focusBeforeAtlasImport: LibraryFocusSection = 'text-input';
  private images: ImageItem[] = [];
  private importedSprites: SpriteData[] | undefined;
  private atlasImportScreen: AtlasImportScreen | undefined;
  private nextImageId = 1;

  // Hidden file input – the only allowed DOM element
  private fileInput: HTMLInputElement;

  private keyboard!: ScreenKeyboard;

  constructor(scene: Phaser.Scene, width: number, height: number, initialState?: { projectName: string; images: ImageItem[] }) {
    super(scene, 0, 0);

    this.screenW = width;
    this.screenH = height;

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
    this.fileInput.accept = 'image/png,image/jpeg,image/gif,image/webp,application/json,.json';
    this.fileInput.multiple = true;
    this.fileInput.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:0;height:0;';
    document.body.appendChild(this.fileInput);
    this.fileInput.addEventListener('change', () => { void this.handleFileSelect(); });

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
      case 'next':
        this.proceedToSpriteEdit();
        break;
      case 'import-local':
        this.clearLibraryForReplace();
        this.fileInput.click();
        break;
      case 'import-workspace':
        this.clearLibraryForReplace();
        void this.openAtlasImportScreen();
        break;
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
        if (toDelete.length > 0) {
          this.importedSprites = undefined;
        }
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

  private proceedToSpriteEdit() {
    const trimmedName = this.nameInput.value.trim();
    const name = trimmedName || 'project';
    if (!trimmedName) {
      this.nameInput.setValue(name);
    }

    if (this.images.length === 0) {
      this.showError('Add at least one image');
      return;
    }

    this.errorText.setVisible(false);
    const payload: LibraryProceedPayload = {
      projectName: name,
      images: [...this.images],
      sprites: typeof this.importedSprites !== 'undefined' ? [...this.importedSprites] : undefined,
    };
    this.emit('proceed', payload);
  }

  private clearLibraryForReplace() {
    this.images.forEach(image => {
      if (this.scene.textures.exists(image.textureKey)) {
        this.scene.textures.remove(image.textureKey);
      }
    });

    this.images = [];
    this.importedSprites = undefined;
    this.nextImageId = 1;

    this.grid.setCells([{ id: '__add__', type: 'add', selected: false }]);
    this.grid.setCursor(0);
    this.updateButtonsForSelection(0);
    this.errorText.setVisible(false);
  }

  // ── File import ────────────────────────────────────────────────────────────

  private async handleFileSelect() {
    const files = this.fileInput.files;
    if (!files || files.length === 0) return;

    const selectedFiles = Array.from(files);
    const atlasTrio = this.findLocalAtlasTrio(selectedFiles);

    if (atlasTrio) {
      try {
        const result = await importAtlasTrio({
          scene: this.scene,
          pngBlob: atlasTrio.png,
          spritesheetJsonText: await atlasTrio.spritesheetJson.text(),
          animationsJsonText: atlasTrio.animationsJson ? await atlasTrio.animationsJson.text() : undefined,
          projectNameHint: this.nameInput.value.trim() || undefined,
        });
        this.applyImportedAtlas(result);
        this.proceedToSpriteEdit();
      } catch (error) {
        this.showError(
          `Import failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      this.fileInput.value = '';
      return;
    }

    const imageFiles = selectedFiles.filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      this.showError('Select image files or atlas trio files');
      this.fileInput.value = '';
      return;
    }

    this.importedSprites = [];

    try {
      await Promise.all(imageFiles.map(file => this.importImageFile(file)));
      this.proceedToSpriteEdit();
    } catch (error) {
      this.showError(
        `Import failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Reset so the same file can be re-selected
    this.fileInput.value = '';
  }

  private importImageFile(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () => {
        reject(new Error(`Failed to read image file: ${file.name}`));
      };

      reader.onload = async (evt) => {
        const dataUrl = evt.target?.result as string | undefined;
        if (!dataUrl) {
          reject(new Error(`Failed to decode image file: ${file.name}`));
          return;
        }

        try {
          await this.importImageFromDataUrl(dataUrl, file.name);
          resolve();
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      };

      reader.readAsDataURL(file);
    });
  }

  private importImageFromDataUrl(dataUrl: string, fileName: string): Promise<void> {
    const id = `img_${this.nextImageId++}`;
    const textureKey = `editor_img_${id}`;

    return new Promise((resolve, reject) => {
      // addBase64 is async; listen for completion before creating the cell
      if (this.scene.textures.exists(textureKey)) {
        this.scene.textures.remove(textureKey);
      }

      const eventName = `addtexture-${textureKey}`;
      const timer = window.setTimeout(() => {
        this.scene.textures.off(eventName, onAdded);
        reject(new Error(`Timed out while importing image: ${fileName}`));
      }, 5000);

      const onAdded = () => {
        window.clearTimeout(timer);
        const frame = this.scene.textures.getFrame(textureKey);
        if (!frame) {
          reject(new Error(`Missing imported texture frame: ${fileName}`));
          return;
        }

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
        resolve();
      };

      this.scene.textures.once(eventName, onAdded);

      try {
        this.scene.textures.addBase64(textureKey, dataUrl);
      } catch (error) {
        window.clearTimeout(timer);
        this.scene.textures.off(eventName, onAdded);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private findLocalAtlasTrio(files: File[]): LocalAtlasTrio | null {
    const byName = new Map(files.map(file => [file.name.toLowerCase(), file]));
    const png = byName.get('spritesheet.png');
    const spritesheetJson = byName.get('spritesheet.json');

    if (!png || !spritesheetJson) {
      return null;
    }

    return {
      png,
      spritesheetJson,
      animationsJson: byName.get('animations.json'),
    };
  }

  private async openAtlasImportScreen() {
    if (this.atlasImportScreen) return;

    try {
      const configResponse = await fetch('configs/assets.json');
      if (!configResponse.ok) {
        throw new Error('Failed to load configs/assets.json');
      }

      const configData = await configResponse.json() as unknown;
      const atlasList = this.parseWorkspaceAtlasList(configData);

      if (atlasList.length === 0) {
        this.showError('No atlas entries found in assets config');
        return;
      }

      this.focusBeforeAtlasImport = this.focusSection;
      this.deactivateCurrentFocus();
      this.keyboard.pause();

      this.atlasImportScreen = new AtlasImportScreen(this.scene, this.screenW, this.screenH, atlasList);
      this.atlasImportScreen.once('cancel', () => {
        this.closeAtlasImportScreen();
      });
      this.atlasImportScreen.once('confirm', (payload: { atlas: WorkspaceAtlasEntry }) => {
        this.closeAtlasImportScreen();
        void this.importAtlasFromWorkspace(payload.atlas);
      });
    } catch (error) {
      this.showError(
        `Import failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private closeAtlasImportScreen() {
    if (!this.atlasImportScreen) return;

    this.atlasImportScreen.destroy();
    this.atlasImportScreen = undefined;
    this.keyboard.resume();
    this.restoreFocusAfterAtlasImport();
  }

  private async importAtlasFromWorkspace(atlas: WorkspaceAtlasEntry) {
    try {
      const [pngResponse, spritesheetResponse, animationsResponse] = await Promise.all([
        fetch(atlas.png),
        fetch(atlas.json),
        atlas.animations ? fetch(atlas.animations) : Promise.resolve(null),
      ]);

      if (!pngResponse.ok) {
        throw new Error(`Failed to load atlas PNG at ${atlas.png}`);
      }
      if (!spritesheetResponse.ok) {
        throw new Error(`Failed to load atlas JSON at ${atlas.json}`);
      }
      if (animationsResponse && !animationsResponse.ok) {
        throw new Error(`Failed to load animations JSON at ${atlas.animations}`);
      }

      const result = await importAtlasTrio({
        scene: this.scene,
        pngBlob: await pngResponse.blob(),
        spritesheetJsonText: await spritesheetResponse.text(),
        animationsJsonText: animationsResponse ? await animationsResponse.text() : undefined,
        projectNameHint: atlas.atlasId,
      });

      this.applyImportedAtlas(result);
      this.proceedToSpriteEdit();
    } catch (error) {
      this.showError(
        `Import failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private parseWorkspaceAtlasList(configData: unknown): WorkspaceAtlasEntry[] {
    if (!isRecord(configData)) return [];
    if (!Array.isArray(configData.atlases)) return [];

    return configData.atlases.reduce<WorkspaceAtlasEntry[]>((list, entry) => {
      if (!isRecord(entry)) return list;

      const atlasId = typeof entry.atlasId === 'string' ? entry.atlasId.trim() : '';
      const png = typeof entry.png === 'string' ? entry.png.trim() : '';
      const json = typeof entry.json === 'string' ? entry.json.trim() : '';
      const animationsRaw = entry.animations;
      const animations = typeof animationsRaw === 'string' && animationsRaw.trim()
        ? animationsRaw.trim()
        : undefined;

      if (!atlasId || !png || !json) return list;

      list.push({
        atlasId,
        png,
        json,
        animations,
      });
      return list;
    }, []);
  }

  private deactivateCurrentFocus() {
    if (this.focusSection === 'text-input') {
      this.nameInput.blur();
      return;
    }
    if (this.focusSection === 'grid') {
      this.grid.deactivate();
      return;
    }
    this.buttonBar.deactivate();
  }

  private restoreFocusAfterAtlasImport() {
    if (this.focusBeforeAtlasImport === 'text-input') {
      this.focusSection = 'text-input';
      this.nameInput.focus();
      return;
    }

    if (this.focusBeforeAtlasImport === 'grid') {
      this.focusSection = 'grid';
      this.nameInput.blur();
      this.grid.activate();
      return;
    }

    this.focusSection = 'button-bar';
    this.nameInput.blur();
    this.buttonBar.activate();
  }

  private applyImportedAtlas(result: ImportAtlasTrioResult) {
    this.images = [...result.images];
    this.importedSprites = [...result.sprites];
    this.nextImageId = result.images.length + 1;

    this.grid.setCells([
      ...result.images.map(img => ({
        id: img.id,
        type: 'image' as const,
        textureKey: img.textureKey,
        selected: false,
      })),
      { id: '__add__', type: 'add' as const, selected: false },
    ]);
    this.grid.setCursor(0);
    this.grid.deactivate();
    this.focusSection = 'text-input';
    this.nameInput.focus();
    this.updateButtonsForSelection(0);
    this.errorText.setVisible(false);

    if (result.projectName && this.nameInput.value !== result.projectName) {
      this.nameInput.setValue(result.projectName);
    }

    if (result.warnings.length > 0) {
      console.warn('[SpriteEditor][Import] warnings:', result.warnings);
    }
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
    this.atlasImportScreen?.destroy();
    this.atlasImportScreen = undefined;
    this.keyboard.destroy();
    if (this.fileInput.parentNode) {
      this.fileInput.parentNode.removeChild(this.fileInput);
    }
    super.destroy(fromScene);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}
