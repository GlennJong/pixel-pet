import Phaser from 'phaser';
import {
  TextInput,
  GridSelector,
  ButtonBar,
  ConfirmDialog,
  OptionMenu,
  OptionMenuItem,
} from '../elements';
import { ScreenKeyboard } from '@/game/ui';
import {
  FocusRouter,
  FocusScope,
  Focusable,
  createScope,
  makeFocusable,
} from '@/game/ui/focus';
import { EditorScreen } from './EditorScreen';
import { importAtlasTrio, ImportAtlasTrioResult } from '../utils/import';
import { loadWorkspaceAtlasProject } from '../utils/workspaceAtlas';
import { resolveDefaultAtlas } from '../utils/template';
import { parseSmartFileName } from '../utils/smartInput';
import { importImageFiles } from '../utils/imageLibrary';
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
  LibraryProceedPayload,
  NavHost,
  SpriteData,
} from '../types';

// This screen's own bottom bar carries only the contextual multi-select actions,
// shown while grid cells are selected. Screen/scene navigation is the shared nav.
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
 * Two modes, each a FocusScope driven by the shared {@link FocusRouter}:
 *   - menu: [OptionMenu, nav]  (LOAD DATA / CREATE NEW / {current})
 *   - edit: [name TextInput, image grid, selection bar (when selecting), nav]
 * Geometry moves between widgets by position; boundary overrides wrap top↔nav.
 * The depose confirmation and the atlas-import overlay are handled as a pushed
 * modal scope and a paused-router overlay respectively.
 *
 * Events emitted:
 *   'proceed' ({ projectName, images, sprites? })
 *   'exit'
 */
export class LibraryScreen extends EditorScreen {
  private readonly navHost: NavHost;

  private nameInput: TextInput;
  private grid: GridSelector;
  private buttonBar: ButtonBar;
  private optionMenu: OptionMenu;
  private confirmDialog: ConfirmDialog;
  private errorText: Phaser.GameObjects.Text;

  /** Action awaiting confirmation when it would deposit the current project. */
  private pendingMenuAction?: 'load' | 'create';
  /** True while grid cells are multi-selected (own contextual bar is shown). */
  private selectionActive = false;

  private images: ImageItem[] = [];
  private importedSprites: SpriteData[] | undefined;
  /** True once CREATE NEW starts a fresh project: proceed must reset sprites. */
  private isNewProject = false;

  // Hidden file input – the only allowed DOM element
  private fileInput: HTMLInputElement;
  private readonly onFileInputChange = () => { void this.handleFileSelect(); };

  /** Auto-hide timer for the error banner; only one runs at a time. */
  private errorTimer?: Phaser.Time.TimerEvent;

  // Focus model.
  private readonly router = new FocusRouter();
  private menuScope!: FocusScope;
  private editScope!: FocusScope;
  private deposeScope!: FocusScope;
  private menuFocusable!: Focusable;
  private nameFocusable!: Focusable;
  private gridFocusable!: Focusable;
  private selectionFocusable!: Focusable;
  private navFocusable!: Focusable;

  constructor(
    scene: Phaser.Scene,
    width: number,
    height: number,
    initialState: { projectName: string; images: ImageItem[] } | undefined,
    navHost: NavHost,
    /**
     * Where to open. 'edit' goes straight to the material view — the normal
     * case now that a project always arrives pre-loaded, so the entry menu
     * would be a question with an obvious answer. 'menu' is still reachable
     * from the LIBRARY nav button, which is what LOAD DATA / CREATE NEW live on.
     */
    startIn: 'menu' | 'edit' = 'edit',
  ) {
    super(scene);

    this.navHost = navHost;

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
      this.grid.prependImageCells(initialState.images.map(img => ({ id: img.id, textureKey: img.textureKey })));
    }
    // ── Selection action bar (DELETE/CANCEL) — shown only during multi-select;
    // screen navigation lives in the scene-owned nav bar at this same y. ───────
    this.buttonBar = new ButtonBar(scene, buttonBarY, width, buttonsWithSelection(0), 'left');
    this.buttonBar.setVisible(false);
    this.add(this.buttonBar);

    // ── Entry menu (LOAD DATA / CREATE NEW / {current}) ───────────────────────
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
    // The name input keeps its own key handling while focused (the screen
    // keyboard is muted via shouldHandleKeyDown); its nav-up/nav-down bridge into
    // the router so ArrowUp/Enter/Escape move focus by geometry.
    this.nameInput.on('nav-up', () => this.router.moveFocus('UP'));
    this.nameInput.on('nav-down', () => this.router.moveFocus('DOWN'));

    // Pointer events on a widget take router focus first, so the keyboard always
    // resumes from what the mouse last touched (the name input's nav-up/nav-down
    // bridges in particular resolve directions from the router's focused member).
    this.nameInput.on('request-focus', () => this.router.focusId('name'));
    this.grid.on('request-focus', () => this.router.focusId('grid'));
    this.optionMenu.on('request-focus', () => this.router.focusId('menu'));
    this.buttonBar.on('request-focus', () => this.router.focusId('selection-bar'));

    this.grid.on('add-request', () => this.fileInput.click());
    this.grid.on('selection-change', (selected: unknown[]) => {
      this.updateButtonsForSelection(selected.length);
    });

    this.buttonBar.on('action', (key: string) => this.handleButtonAction(key));
    this.optionMenu.on('select', (key: string) => this.handleMenuSelect(key));
    this.confirmDialog.on('confirm', () => this.confirmDepose());
    this.confirmDialog.on('cancel', () => this.cancelDepose());

    this.setupFocus();

    // ── Keyboard ──────────────────────────────────────────────────────────────
    this.keyboard = new ScreenKeyboard({
      scene,
      canAttach: () => this.active,
      // While the DOM-style TextInput owns keys, mute the router path.
      shouldHandleKeyDown: () => !this.nameInput.isFocused,
      onKeyDown: (code: string) => this.router.handleKey(code),
    });
    this.keyboard.attach();

    scene.add.existing(this);

    // An empty library has nothing to edit, so it falls back to the menu
    // whatever the caller asked for.
    if (startIn === 'edit' && this.images.length > 0) this.showEdit();
    else this.showMenu();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  update() { /* keyboard-event driven */ }

  /** Pause/resume the focus router + keyboard (around the atlas-import overlay). */
  pause() { this.router.pause(); this.keyboard.pause(); }
  resume() { this.keyboard.resume(); this.router.resume(); }

  /**
   * Whether SPRITES can do anything right now. S2 frames images, so an empty
   * library has nothing to show. The scene polls this to grey the nav button —
   * polling rather than an event because `images` is mutated from five places
   * (import, delete, replace, atlas import, restore-on-return) and a missed
   * notification would leave a button lying about its availability.
   */
  get canProceed(): boolean {
    return this.images.length > 0;
  }

  /** Build + emit the proceed payload (invoked by the scene's SPRITES nav).
   *  Refused with a hint while the library is empty — S2 has nothing to frame. */
  requestProceed() {
    if (this.images.length === 0) {
      this.showError('Import images before editing sprites');
      return;
    }
    this.proceedToSpriteEdit();
  }

  // ── Focus model ─────────────────────────────────────────────────────────────

  private setupFocus() {
    this.menuFocusable = this.optionMenu.asFocusable('menu');

    this.nameFocusable = makeFocusable({
      id: 'name',
      object: this.nameInput,
      onFocus: () => this.nameInput.focus(),
      onBlur: () => this.nameInput.blur(),
    });

    this.gridFocusable = this.grid.asFocusable('grid', {
      handleKey: (code) => {
        if (code !== 'Escape') return false;
        if (this.selectionActive) {
          this.grid.clearAllSelections();
          this.updateButtonsForSelection(0);
        }
        return true; // consume Escape (no back from the grid)
      },
    });

    this.selectionFocusable = this.buttonBar.asFocusable('selection-bar', {
      isEnabled: () => this.selectionActive,
      homeOnEnter: 'first',
      handleKey: (code) => {
        if (code !== 'Escape') return false;
        this.grid.clearAllSelections();
        this.updateButtonsForSelection(0);
        this.router.focusId('grid');
        return true;
      },
    });

    this.navFocusable = this.navHost.buildNavFocusable(
      (edge) => this.router.focusEdge(edge, 'nav'),
      () => this.router.focusId('nav'),
    );

    // Wraps must carry the travel direction: without it the landed widget's
    // onFocus(from) can't tell which edge it was entered from and keeps whatever
    // internal cursor it had (e.g. wrapping down onto the menu would land on the
    // row you last walked to, not the first).
    const wrap = {
      UP: () => this.router.focusEdge('last', undefined, 'UP'),    // top content ↑ → bottom (nav / selection bar)
      DOWN: () => this.router.focusEdge('first', undefined, 'DOWN'), // bottom ↓ → top content (wrap)
    };

    this.menuScope = createScope({
      id: 'library-menu',
      members: () => [this.menuFocusable, this.navFocusable],
      boundaryOverride: wrap,
    });

    this.editScope = createScope({
      id: 'library-edit',
      members: () => [this.nameFocusable, this.gridFocusable, this.selectionFocusable, this.navFocusable],
      boundaryOverride: wrap,
    });

    // Depose confirmation: modal scope forwarding every key to the dialog.
    this.deposeScope = createScope({
      id: 'depose',
      members: () => [this.confirmDialog.asFocusable('depose-dialog')],
    });
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
    this.pendingMenuAction = undefined;
    this.confirmDialog.close();
    this.nameInput.blur();
    this.nameInput.setVisible(false);
    this.grid.deactivate();
    this.grid.setVisible(false);
    this.optionMenu.setItems(this.buildMenuItems());
    // buildMenuItems() changes length (a leading '{name}(current)' row appears
    // once a project exists), so a carried-over cursor index would point at a
    // different action than last time. Always open on the first row.
    this.optionMenu.setCursor(0);
    this.optionMenu.setVisible(true);
    this.updateButtonsForSelection(0);
    this.errorText.setVisible(false);
    this.router.setBaseScope(this.menuScope, 'menu');
  }

  /** Show the editor (name input + grid); hide the entry menu. */
  private showEdit() {
    this.pendingMenuAction = undefined;
    this.confirmDialog.close();
    this.optionMenu.deactivate();
    this.optionMenu.setVisible(false);
    this.nameInput.setVisible(true);
    this.grid.setVisible(true);
    this.updateButtonsForSelection(0);
    this.errorText.setVisible(false);
    this.router.setBaseScope(this.editScope, 'name');
  }

  /**
   * CREATE NEW restarts from the factory copy of the current sprite set, not
   * from a blank library.
   *
   * A blank start would require the user to know the shape of the thing they are
   * building — which animations exist and how many frames each wants. That
   * knowledge lives in the atlas's animations.json, so the editor supplies it:
   * the new project arrives with every slot filled and editing is replacement.
   *
   * If the default cannot be loaded, fall back to the blank project rather than
   * refusing — the user can still build one by hand.
   */
  private async enterCreateNew() {
    // Read before clearing: the project name is the atlasId picked on S0, and
    // "start over" means start over on *this* sprite set, not on another one.
    const currentAtlasId = this.nameInput.value.trim();

    this.clearLibraryForReplace();
    this.nameInput.setValue('');
    // Fresh project — its sprite configs start empty (drop any prior project's).
    this.isNewProject = true;
    this.showEdit();

    try {
      const atlas = await resolveDefaultAtlas(currentAtlasId);
      if (!atlas) return; // nothing editable to copy; the blank project stands
      this.applyImportedAtlas(await loadWorkspaceAtlasProject(this.scene, atlas));
    } catch (error) {
      console.warn('[SpriteEditor] CREATE NEW could not copy the factory atlas', error);
    }
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
        else this.emit('load-data');
        break;
      case 'create':
        if (this.hasProject()) this.askDeposeConfirm('create');
        else void this.enterCreateNew();
        break;
    }
  }

  private hasProject() {
    return this.images.length > 0;
  }

  // ── Depose confirmation (modal dialog: message + CONFIRM/CANCEL) ─────────────

  private askDeposeConfirm(action: 'load' | 'create') {
    this.pendingMenuAction = action;
    this.errorText.setVisible(false);

    const name = this.nameInput.value.trim() || 'project';
    this.confirmDialog.open(
      `Are you sure?\nIf you LOAD DATA or CREATE NEW,\n${name} would be deposed?`,
    );
    this.emitNavSuppress();
    this.router.pushModal(this.deposeScope);
  }

  private confirmDepose() {
    const action = this.pendingMenuAction;
    this.confirmDialog.close();
    // showMenu / enterCreateNew reset the base scope (dropping the modal).
    if (action === 'load') {
      this.showMenu();
      this.emit('load-data');
    } else if (action === 'create') {
      void this.enterCreateNew();
    }
    this.emitNavSuppress();
  }

  private cancelDepose() {
    this.confirmDialog.close();
    this.showMenu();
    this.emitNavSuppress();
  }

  // ── Button actions ─────────────────────────────────────────────────────────

  private handleButtonAction(key: string) {
    switch (key) {
      case 'cancel':
        this.grid.clearAllSelections();
        this.updateButtonsForSelection(0);
        this.router.focusId('grid');
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
        this.router.focusId('grid');
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
    // The selection bar / nav availability just changed — re-home if the focused
    // member became unavailable.
    this.router.refreshAvailability();
  }

  /** Emit the combined nav-suppress signal (modal or contextual bar is up). */
  private emitNavSuppress() {
    const suppressed = this.selectionActive || this.confirmDialog.isOpen;
    this.emit('nav-suppress', suppressed);
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
      // Shared with the frame selector, which imports material too — see
      // utils/imageLibrary.ts. Two copies of "allocate an id, load a texture"
      // would drift.
      const added = await importImageFiles(this.scene, imageFiles, this.images);
      this.images = [...this.images, ...added];
      added.forEach(img => this.grid.addImageCell({ id: img.id, textureKey: img.textureKey }));
      // Derive the project name once after the whole batch — doing it per image
      // re-parsed every filename O(n) times per import.
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

  private applyImportedAtlas(result: ImportAtlasTrioResult) {
    this.images = [...result.images];
    this.importedSprites = [...result.sprites];
    this.isNewProject = false;

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
