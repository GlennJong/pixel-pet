import Phaser from 'phaser';
import {
  TextInput,
  GridSelector,
  ButtonBar,
  ConfirmDialog,
  ScreenKeyboard,
  handleButtonBarKey,
  OptionMenu,
  OptionMenuItem,
} from '../elements';
import { AtlasImportScreen } from './AtlasImportScreen';
import { EditorScreen } from './EditorScreen';
import { importAtlasTrio, ImportAtlasTrioResult } from '../utils/import';
import { parseSmartFileName } from '../utils/smartInput';
import { loadTextureFromDataUrl } from '../utils/texture';
import { isRecord } from '../utils/json';
import {
  COLORS,
  FONT,
  BUTTON_BAR_HEIGHT,
  TEXT_INPUT_HEIGHT,
  GRID_OUTER_PAD,
  BANNER_AUTOHIDE_MS,
  hex,
} from '../constants';
import {
  ImageItem,
  LibraryFocusSection,
  LibraryProceedPayload,
  SpriteData,
  WorkspaceAtlasEntry,
} from '../types';

// Screen navigation (LIBRARY / SPRITES / EXIT) is owned by the scene
// (SpriteEditor/index) now. This screen's own bottom bar only carries the
// contextual multi-select actions, shown while grid cells are selected.
const buttonsWithSelection = (n: number) => [
  { key: 'delete', label: n > 0 ? `DELETE(${n})` : 'DELETE' },
  { key: 'cancel', label: 'CANCEL' },
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
export class LibraryScreen extends EditorScreen {
  private readonly screenW: number;
  private readonly screenH: number;

  private nameInput: TextInput;
  private grid: GridSelector;
  private buttonBar: ButtonBar;
  private optionMenu: OptionMenu;
  private confirmDialog: ConfirmDialog;
  private errorText: Phaser.GameObjects.Text;

  /** 'menu' = entry menu (LOAD DATA / CREATE NEW); 'edit' = name input + grid. */
  private mode: 'menu' | 'edit' = 'menu';
  /** Action awaiting confirmation when it would deposit the current project. */
  private pendingMenuAction?: 'load' | 'create';
  /** True while grid cells are multi-selected (own contextual bar is shown). */
  private selectionActive = false;

  private focusSection: LibraryFocusSection = 'menu';
  private focusBeforeAtlasImport: LibraryFocusSection = 'menu';
  private images: ImageItem[] = [];
  private importedSprites: SpriteData[] | undefined;
  /** True once CREATE NEW starts a fresh project: proceed must reset sprites. */
  private isNewProject = false;
  private atlasImportScreen: AtlasImportScreen | undefined;
  private nextImageId = 1;

  // Hidden file input – the only allowed DOM element
  private fileInput: HTMLInputElement;
  private readonly onFileInputChange = () => { void this.handleFileSelect(); };

  /** Auto-hide timer for the error banner; only one runs at a time. */
  private errorTimer?: Phaser.Time.TimerEvent;

  constructor(scene: Phaser.Scene, width: number, height: number, initialState?: { projectName: string; images: ImageItem[] }) {
    super(scene);

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
    // ── Selection action bar (DELETE/CANCEL) — shown only during multi-select;
    // screen navigation lives in the scene-owned nav bar at this same y. ───────
    this.buttonBar = new ButtonBar(scene, buttonBarY, width, buttonsWithSelection(0), 'left');
    this.buttonBar.setVisible(false);
    this.add(this.buttonBar);

    // ── Entry menu (LOAD DATA / CREATE NEW / {current}) ───────────────────────
    // Framed panel; auto-sizes to its rows (a small box for 2–3 options).
    this.optionMenu = new OptionMenu(
      scene,
      PAD,
      inputY,
      width - PAD * 2,
      buttonBarY - inputY - GRID_OUTER_PAD,
      [],
    );
    this.add(this.optionMenu);

    // ── Depose-confirm dialog (shared modal; drawn on top, hidden until asked) ─
    this.confirmDialog = new ConfirmDialog(scene, { width, height });
    this.add(this.confirmDialog);

    // ── Error hint ────────────────────────────────────────────────────────────
    this.errorText = scene.add.text(PAD, buttonBarY - 2, '', {
      fontFamily: FONT.FAMILY,
      fontSize: FONT.SIZE,
      color: hex(COLORS.ERROR),
    }).setOrigin(0, 1).setVisible(false);
    this.add(this.errorText);

    // ── File input (single DOM exception) ────────────────────────────────────
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'image/png,image/jpeg,image/gif,image/webp,application/json,.json';
    this.fileInput.multiple = true;
    this.fileInput.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:0;height:0;';
    document.body.appendChild(this.fileInput);
    this.fileInput.addEventListener('change', this.onFileInputChange);

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
    this.optionMenu.on('select', (key: string) => this.handleMenuSelect(key));
    this.confirmDialog.on('confirm', () => { this.confirmDialog.close(); this.confirmDepose(); });
    this.confirmDialog.on('cancel', () => this.cancelDepose());

    // ── Keyboard ──────────────────────────────────────────────────────────────
    this.keyboard = new ScreenKeyboard({
      scene,
      canAttach: () => this.active,
      shouldHandleKeyDown: () => !this.nameInput.isFocused,
      onKeyDown: (code: string) => this.handleNavKey(code),
    });
    this.keyboard.attach();

    scene.add.existing(this);

    // Start on the entry menu (shows {name}(current) when returning with a project).
    this.showMenu();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Call from EditorScene.update() if polling-based updates are needed */
  update() {
    // Currently keyboard-event driven; placeholder for future use
  }

  // ── Shared-nav contract (driven by SpriteEditor/index) ──────────────────────

  /** Pause/resume this screen's keyboard while the scene nav owns focus. */
  pause() { this.keyboard.pause(); }
  resume() { this.keyboard.resume(); }

  /** Re-take focus from the scene nav, landing on this screen's bottom content. */
  focusFromNav() {
    if (this.mode === 'menu') this.transitionToMenuFocus('last');
    else this.transitionToGrid(/* lastRow */ true);
  }

  /** Build + emit the proceed payload (invoked by the scene's SPRITES nav). */
  requestProceed() { this.proceedToSpriteEdit(); }

  // ── Navigation ─────────────────────────────────────────────────────────────

  private handleNavKey(code: string) {
    if (this.confirmDialog.isOpen) {
      this.confirmDialog.handleKey(code);
      return;
    }
    if (this.focusSection === 'menu') {
      switch (code) {
        case 'ArrowUp':
          this.optionMenu.moveCursor(-1);
          break;
        case 'ArrowDown':
          if (this.optionMenu.cursorIndex >= this.optionMenu.itemCount - 1) {
            this.leaveToNav();
          } else {
            this.optionMenu.moveCursor(1);
          }
          break;
        case 'Space':
        case 'Enter':
          this.optionMenu.selectCurrent();
          break;
      }
    } else if (this.focusSection === 'grid') {
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
          // With a selection, the own DELETE/CANCEL bar owns the bottom; else
          // hand focus down to the scene nav.
          if (!moved) {
            if (this.selectionActive) this.transitionToButtonBar();
            else this.leaveToNav();
          }
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
      handleButtonBarKey(this.buttonBar, code, {
        onExitUp: () => this.exitButtonBarUp(),
        onEscape: () => {
          if (this.mode === 'edit') {
            this.grid.clearAllSelections();
            this.updateButtonsForSelection(0);
            this.transitionToGrid(true);
          } else {
            this.transitionToMenuFocus();
          }
        },
      });
    }
  }

  // ── Mode switching ───────────────────────────────────────────────────────

  private buildMenuItems(): OptionMenuItem[] {
    const items: OptionMenuItem[] = [];
    if (this.images.length > 0) {
      const name = this.nameInput.value.trim() || 'project';
      items.push({ key: 'current', label: `${name}(current)` });
    }
    items.push({ key: 'load', label: 'LOAD DATA' });
    items.push({ key: 'create', label: 'CREATE NEW' });
    return items;
  }

  /** Show the entry menu (LOAD DATA / CREATE NEW / {current}); hide the editor. */
  showMenu() {
    this.mode = 'menu';
    this.pendingMenuAction = undefined;
    this.confirmDialog.close();
    this.nameInput.blur();
    this.nameInput.setVisible(false);
    this.grid.deactivate();
    this.grid.setVisible(false);
    this.optionMenu.setItems(this.buildMenuItems());
    this.optionMenu.setVisible(true);
    this.updateButtonsForSelection(0);
    this.errorText.setVisible(false);
    this.transitionToMenuFocus();
  }

  /** Show the editor (name input + grid); hide the entry menu. */
  private showEdit() {
    this.mode = 'edit';
    this.pendingMenuAction = undefined;
    this.confirmDialog.close();
    this.optionMenu.deactivate();
    this.optionMenu.setVisible(false);
    this.nameInput.setVisible(true);
    this.grid.setVisible(true);
    this.updateButtonsForSelection(0);
    this.errorText.setVisible(false);
    this.focusSection = 'text-input';
    this.nameInput.focus();
  }

  private enterCreateNew() {
    this.clearLibraryForReplace();
    this.nameInput.setValue('');
    // Fresh project — its sprite configs start empty (drop any prior project's).
    this.isNewProject = true;
    this.showEdit();
  }

  private handleMenuSelect(key: string) {
    switch (key) {
      case 'current':
        // Resuming the existing project — keep its sprite configs.
        this.isNewProject = false;
        this.showEdit();
        break;
      case 'load':
        if (this.hasProject()) this.askDeposeConfirm('load');
        else void this.openAtlasImportScreen();
        break;
      case 'create':
        if (this.hasProject()) this.askDeposeConfirm('create');
        else this.enterCreateNew();
        break;
    }
  }

  private hasProject() {
    return this.images.length > 0;
  }

  // ── Depose confirmation (shared modal dialog: message + CONFIRM/CANCEL nav) ──

  private askDeposeConfirm(action: 'load' | 'create') {
    this.pendingMenuAction = action;
    this.deactivateCurrentFocus();
    this.errorText.setVisible(false);

    const name = this.nameInput.value.trim() || 'project';
    this.confirmDialog.open(
      `Are you sure?\nIf you LOAD DATA or CREATE NEW,\n${name} would be deposed?`,
    );
    this.emitNavSuppress();
  }

  private confirmDepose() {
    const action = this.pendingMenuAction;
    if (action === 'load') {
      this.showMenu();
      void this.openAtlasImportScreen();
    } else if (action === 'create') {
      this.enterCreateNew();
    }
    this.emitNavSuppress();
  }

  private cancelDepose() {
    this.confirmDialog.close();
    this.showMenu();
    this.emitNavSuppress();
  }

  // ── Section transitions ────────────────────────────────────────────────────

  private transitionToMenuFocus(cursor: 'first' | 'last' = 'first') {
    if (this.focusSection === 'button-bar') this.buttonBar.deactivate();
    this.focusSection = 'menu';
    this.optionMenu.activate();
    this.optionMenu.setCursor(cursor === 'last' ? this.optionMenu.itemCount - 1 : 0);
  }

  private exitButtonBarUp() {
    if (this.mode === 'edit') this.transitionToGrid(/* lastRow */ true);
    // Coming up from the nav lands on the last option (symmetric with ArrowDown).
    else this.transitionToMenuFocus('last');
  }

  /** Hand focus down to the scene-owned navigation bar. */
  private leaveToNav() {
    this.deactivateCurrentFocus();
    this.emit('nav-down');
  }

  /** Emit the combined nav-suppress signal (modal or contextual bar is up). */
  private emitNavSuppress() {
    const suppressed = this.selectionActive
      || this.confirmDialog.isOpen
      || this.atlasImportScreen !== undefined;
    this.emit('nav-suppress', suppressed);
  }

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
    if (this.mode === 'menu') this.optionMenu.deactivate();
    else this.grid.deactivate();
    this.focusSection = 'button-bar';
    this.buttonBar.activate();
    this.buttonBar.setCursorToFirst();
  }

  // ── Button actions ─────────────────────────────────────────────────────────

  // Only the contextual multi-select actions live here now — LIBRARY / SPRITES /
  // EXIT moved to the scene-owned nav (SpriteEditor/index).
  private handleButtonAction(key: string) {
    switch (key) {
      case 'cancel':
        this.grid.clearAllSelections();
        this.updateButtonsForSelection(0);
        this.transitionToGrid(/* lastRow */ true);
        break;
      case 'delete': {
        const toDelete = this.grid.selectedIds;
        const deleting = new Set(toDelete);
        // Free each deleted image's texture (it isn't reused) before dropping
        // the record — otherwise the texture leaks in the manager.
        this.images.forEach(img => {
          if (deleting.has(img.id) && this.scene.textures.exists(img.textureKey)) {
            this.scene.textures.remove(img.textureKey);
          }
        });
        toDelete.forEach(id => this.grid.removeCellById(id));
        this.images = this.images.filter(img => !deleting.has(img.id));
        if (toDelete.length > 0) {
          this.importedSprites = undefined;
        }
        this.autoFillProjectNameFromParsedImages();
        this.grid.clearAllSelections();
        this.updateButtonsForSelection(0);
        this.transitionToGrid(/* lastRow */ true);
        break;
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private updateButtonsForSelection(count: number) {
    this.selectionActive = count > 0;
    if (count > 0) {
      this.buttonBar.setButtons(buttonsWithSelection(count));
      this.buttonBar.setAlign('right');
      this.buttonBar.setVisible(true);
    } else {
      this.buttonBar.setVisible(false);
    }
    // Hide the scene nav while our own contextual bar occupies the bottom.
    this.emitNavSuppress();
  }

  private showError(msg: string) {
    this.errorText.setText(msg).setVisible(true);
    // Cancel any in-flight auto-hide so an older timer can't hide this newer
    // banner, and so timers don't stack under rapid errors.
    this.errorTimer?.remove();
    this.errorTimer = this.scene.time.delayedCall(BANNER_AUTOHIDE_MS, () => {
      if (this.errorText?.active) this.errorText.setVisible(false);
      this.errorTimer = undefined;
    });
  }

  private proceedToSpriteEdit() {
    const trimmedName = this.nameInput.value.trim();
    const name = trimmedName || 'project';
    if (!trimmedName) {
      this.nameInput.setValue(name);
    }

    this.errorText.setVisible(false);
    // sprites: imported atlas configs take precedence; a freshly-created project
    // resets to []; otherwise undefined keeps the editor's existing configs
    // (the S2 ↔ Library round-trip).
    const sprites = this.importedSprites !== undefined
      ? [...this.importedSprites]
      : this.isNewProject ? [] : undefined;
    const payload: LibraryProceedPayload = {
      projectName: name,
      images: [...this.images],
      sprites,
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
      // Derive the project name once after the whole batch — doing it per image
      // (inside the map above) re-parsed every filename O(n) times per import.
      this.autoFillProjectNameFromParsedImages();
      // Stay on the Library so the imported thumbnails show in the grid; the user
      // advances to the sprite editor via the SPRITES nav when ready.
      this.errorText.setVisible(false);
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

  private async importImageFromDataUrl(dataUrl: string, fileName: string): Promise<void> {
    const id = `img_${this.nextImageId++}`;
    const textureKey = `editor_img_${id}`;

    const frame = await loadTextureFromDataUrl(this.scene, textureKey, dataUrl);

    const item: ImageItem = {
      id,
      fileName,
      textureKey,
      width: frame.realWidth,
      height: frame.realHeight,
    };
    this.images.push(item);
    this.grid.addImageCell({ id, textureKey });
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
      this.emitNavSuppress();
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
    this.emitNavSuppress();
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
    if (this.focusSection === 'menu') {
      this.optionMenu.deactivate();
      return;
    }
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
    if (this.focusBeforeAtlasImport === 'menu') {
      this.transitionToMenuFocus();
      return;
    }

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
    this.isNewProject = false;
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
    // Loaded data becomes the working project; show the editor view.
    this.showEdit();

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
    this.errorTimer?.remove();
    this.errorTimer = undefined;
    this.fileInput.removeEventListener('change', this.onFileInputChange);
    if (this.fileInput.parentNode) {
      this.fileInput.parentNode.removeChild(this.fileInput);
    }
    // super.destroy() (EditorScreen) tears down the keyboard.
    super.destroy(fromScene);
  }
}
