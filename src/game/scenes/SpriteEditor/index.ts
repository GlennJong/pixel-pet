import Phaser, { Scene } from 'phaser';
import { LibraryScreen } from './screens/LibraryScreen';
import { SpriteEditScreen } from './screens/SpriteEditScreen';
import { FrameSelectorScreen } from './screens/FrameSelectorScreen';
import { ButtonBar } from './elements';
import { Focusable, NavHost, makeFocusable } from './elements/focus';
import { EditorState, LibraryProceedPayload } from './types';
import { buildSpriteEditorExport, downloadSpriteEditorExport } from './utils/export';
import { buildPresetSpritesFromImages } from './utils/smartInput';
import { removeEditorImageTextures } from './utils/texture';
import { saveAtlasCustomization, setCustomizationActive, reloadAtlasIntoScene } from '@/game/customization';
import { getStaticData } from '@/game/staticData';
import { COLORS, FONT, BUTTON_BAR_HEIGHT, BANNER_AUTOHIDE_MS, hex } from './constants';

interface EditorSceneStartData {
  returnSceneKey?: string;
  targetAtlasId?: string;
}

// Persistent bottom navigation shared by the Library (S1) and Sprite Edit (S2)
// screens. This scene owns it so screen-switching is centralized here; the
// keyboard reaches it by arrowing down past a screen's content ('nav-down').
const NAV_BUTTONS = [
  { key: 'library', label: 'LIBRARY' },
  { key: 'sprites', label: 'SPRITES' },
  { key: 'save', label: 'SAVE' },
  { key: 'exit', label: 'EXIT' },
];

// Sub-menu shown in place of NAV_BUTTONS after SAVE is chosen. APPLY writes the
// customization into the running game; EXPORT downloads the artifacts; CANCEL
// returns to the default nav.
const SAVE_BUTTONS = [
  { key: 'apply', label: 'APPLY' },
  { key: 'export', label: 'EXPORT' },
  { key: 'cancel', label: 'CANCEL' },
];

/**
 * EditorScene – Sprite Editor
 *
 * Renders at the live game canvas size (this.scale.width/height), so the UI
 * always matches whatever resolution the host game runs at — no canvas resize.
 * Screens receive that width/height and lay out relative to it; the fixed
 * element sizes live in constants.ts.
 *
 * Screen flow: S1 LibraryScreen ↔ S2 SpriteEditScreen ↔ S3 FrameSelectorScreen
 *
 * Scene key: 'SpriteEditor'
 */
export default class EditorScene extends Scene implements NavHost {
  private libraryScreen?: LibraryScreen;
  private spriteEditScreen?: SpriteEditScreen;
  private frameSelectorScreen?: FrameSelectorScreen;
  private returnSceneKey?: string;
  private targetAtlasId?: string;

  private errorBanner?: Phaser.GameObjects.Text;

  // Persistent bottom navigation (owned here, shared by S1/S2). Keyboard focus is
  // driven by the active screen's FocusRouter, which embeds this bar as a
  // trailing focusable (see buildNavFocusable); the scene only owns the bar,
  // its actions, the SAVE sub-menu, and visibility.
  private navBar?: ButtonBar;
  private navSuppressed = false; // a screen has a modal/contextual bar up
  private navSaveMode = false; // nav is showing the SAVE sub-menu (APPLY/EXPORT/CANCEL)
  private currentScreen: 'library' | 'sprites' | 'frames' | 'none' = 'none';

  // Pending frame-selector context (used when returning from S3 → S2)
  private pendingFrameTarget?: string;

  private state: EditorState = {
    projectName: '',
    images: [],
    sprites: [],
  };

  constructor() {
    super('SpriteEditor');
  }

  init(data: EditorSceneStartData) {
    this.returnSceneKey = data?.returnSceneKey;
    this.targetAtlasId = data?.targetAtlasId;
    this.state = {
      projectName: this.targetAtlasId || '',
      images: [],
      sprites: [],
    };
  }

  create() {
    // Match the live canvas size so the editor UI fits the host game exactly.
    const w = this.scale.width;
    const h = this.scale.height;
    this.add.rectangle(0, 0, w, h, COLORS.BG).setOrigin(0, 0);
    this.buildNavBar(w, h);
    this.showLibraryScreen(w, h);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
  }

  // ── Shared navigation (bottom bar) ───────────────────────────────────────────

  private buildNavBar(w: number, h: number) {
    // Rendered above the screen containers (they're recreated on every switch,
    // so a high depth keeps the nav on top). Hidden while a screen shows a modal
    // (its own bar sits at the same y) and on the frame-selector sub-screen.
    this.navBar = new ButtonBar(this, h - BUTTON_BAR_HEIGHT, w, NAV_BUTTONS, 'left');
    this.navBar.setDepth(500);
    this.navBar.on('action', (key: string) => this.handleNavAction(key));
  }

  /** True when the nav bar can currently take focus (visible + not suppressed). */
  private navShowable(): boolean {
    const showable = this.currentScreen === 'library' || this.currentScreen === 'sprites';
    return showable && !this.navSuppressed;
  }

  /**
   * Build the shared nav bar as a Focusable for the active screen's router. It
   * sits as the trailing (bottom) member of the screen's scope: geometry reaches
   * it going down and the screen's boundary overrides wrap top↔nav. `enterContent`
   * is the screen's hook to return focus to real content (Escape / bridges).
   */
  buildNavFocusable(enterContent: (edge: 'first' | 'last') => void): Focusable {
    return makeFocusable({
      id: 'nav',
      object: this.navBar!,
      isEnabled: () => this.navShowable(),
      onFocus: () => { this.navBar?.activate(); this.navBar?.setCursorToFirst(); },
      onBlur: () => this.navBar?.deactivate(),
      onSelect: () => this.navBar?.executeCursor(), // → 'action' → handleNavAction
      handleKey: (code) => {
        if (code !== 'Escape') return false;
        if (this.navSaveMode) { this.exitSaveMenu(); return true; }
        enterContent('last');
        return true;
      },
      handleDirection: (dir) => {
        if (dir === 'LEFT') { this.navBar?.moveCursor(-1); return true; }
        if (dir === 'RIGHT') { this.navBar?.moveCursor(1); return true; }
        // UP/DOWN: trap inside the bar while the SAVE sub-menu is open; otherwise
        // let the router move (up → content via geometry, down → wrap boundary).
        return this.navSaveMode;
      },
    });
  }

  private handleNavAction(key: string) {
    const w = this.scale.width;
    const h = this.scale.height;

    // SAVE sub-menu actions keep focus on the nav — handle before the shared
    // "leaving the nav" teardown below.
    switch (key) {
      case 'save':
        this.enterSaveMenu();
        return;
      case 'apply':
        this.commitSpritesFromScreen();
        void this.handleApply();
        return;
      case 'export':
        this.commitSpritesFromScreen();
        void this.handleExport();
        return;
      case 'cancel':
        this.exitSaveMenu();
        return;
    }

    switch (key) {
      case 'library':
        if (this.currentScreen === 'library') {
          // Already here — re-open the entry menu (it takes focus itself).
          this.libraryScreen?.showMenu();
        } else {
          if (this.spriteEditScreen) this.state.sprites = this.spriteEditScreen.collectSprites();
          this.showLibraryScreen(w, h);
        }
        break;
      case 'sprites':
        if (this.currentScreen === 'library') {
          // Emits 'proceed' with the library payload → showSpriteEditScreen.
          this.libraryScreen?.requestProceed();
        } else {
          // Already on S2 — move focus from the nav back into the card content.
          this.spriteEditScreen?.focusContent('last');
        }
        break;
      case 'exit':
        this.exitEditor();
        break;
    }
  }

  /** Swap the nav to the SAVE sub-menu (APPLY / EXPORT / CANCEL). Focus stays on
   *  the 'nav' focusable in the active router; only the buttons change. */
  private enterSaveMenu() {
    this.navSaveMode = true;
    this.navBar?.setButtons(SAVE_BUTTONS);
    this.navBar?.activate();
    this.navBar?.setCursorToFirst();
  }

  /** Restore the default nav buttons after the SAVE sub-menu. */
  private exitSaveMenu() {
    this.navSaveMode = false;
    this.navBar?.setButtons(NAV_BUTTONS);
    this.navBar?.activate();
    this.navBar?.setCursorToFirst();
  }

  /** Snapshot the live sprite configs before a SAVE action, when on S2. */
  private commitSpritesFromScreen() {
    if (this.spriteEditScreen) this.state.sprites = this.spriteEditScreen.collectSprites();
  }

  /** Recompute nav visibility from the current screen + suppression state. */
  private refreshNav() {
    this.navBar?.setVisible(this.navShowable());
  }

  /** Wire the shared nav-suppress signal (a screen has a modal/contextual bar up). */
  private wireScreenNav(screen: Phaser.GameObjects.Container) {
    screen.on('nav-suppress', (suppressed: boolean) => {
      this.navSuppressed = suppressed;
      this.refreshNav();
    });
  }

  update() {
    this.libraryScreen?.update();
    this.spriteEditScreen?.update();
    this.frameSelectorScreen?.update();
  }

  private handleShutdown() {
    this.libraryScreen?.destroy();
    this.spriteEditScreen?.destroy();
    this.frameSelectorScreen?.destroy();
    this.navBar?.destroy();
    this.libraryScreen = undefined;
    this.spriteEditScreen = undefined;
    this.frameSelectorScreen = undefined;
    this.navBar = undefined;
    // Final teardown: free every editor_img_* texture. This is done here (not in
    // a screen's destroy) because screens are destroyed/recreated on navigation
    // round-trips where the textures must survive.
    removeEditorImageTextures(this);
  }

  /** Leave the editor, returning to the scene that launched it. */
  private exitEditor() {
    this.scene.start(this.returnSceneKey || 'MainScene');
  }

  // ── S1 – Library ───────────────────────────────────────────────────────────

  private showLibraryScreen(w: number, h: number) {
    this.frameSelectorScreen?.destroy();
    this.frameSelectorScreen = undefined;
    this.spriteEditScreen?.destroy();
    this.spriteEditScreen = undefined;
    this.libraryScreen?.destroy();

    this.libraryScreen = new LibraryScreen(this, w, h, {
      projectName: this.state.projectName,
      images: this.state.images,
    }, this);
    this.libraryScreen.on('exit', () => this.exitEditor());
    this.libraryScreen.on('proceed', (data: LibraryProceedPayload) => {
      this.state.projectName = data.projectName;
      this.state.images = data.images;
      if (typeof data.sprites !== 'undefined') {
        this.state.sprites = data.sprites;
      }
      this.showSpriteEditScreen(w, h);
    });
    this.wireScreenNav(this.libraryScreen);

    this.currentScreen = 'library';
    this.navSuppressed = false;
    this.navSaveMode = false;
    this.navBar?.setButtons(NAV_BUTTONS);
    this.navBar?.deactivate(); // focus starts on the screen content, not the nav
    this.refreshNav();
  }

  // ── S2 – Sprite Edit ───────────────────────────────────────────────────────

  private showSpriteEditScreen(w: number, h: number) {
    this.frameSelectorScreen?.destroy();
    this.frameSelectorScreen = undefined;
    this.libraryScreen?.destroy();
    this.libraryScreen = undefined;
    this.spriteEditScreen?.destroy();

    // Purge orphan frame refs before showing S2
    const validIds = new Set(this.state.images.map(img => img.id));
    this.state.sprites = this.state.sprites.map(sp => ({
      ...sp,
      frames: sp.frames.filter(fid => validIds.has(fid)),
    }));

    // Smart preset: create initial sprite configs from imported file names
    // (e.g. currycat_idle_0.png) only when no sprite config exists yet.
    if (this.state.sprites.length === 0) {
      const preset = buildPresetSpritesFromImages(this.state.images);
      if (preset.sprites.length > 0) {
        this.state.sprites = preset.sprites;
        console.log('[SpriteEditor] Smart preset applied', {
          spriteCount: preset.sprites.length,
          parsedImageCount: preset.parsedImageCount,
          skippedImageCount: preset.skippedImageCount,
          detectedKeys: preset.detectedKeys,
        });
      }
    }

    this.spriteEditScreen = new SpriteEditScreen(
      this, w, h, this.state.images, this.state.sprites, this,
    );
    this.wireScreenNav(this.spriteEditScreen);

    this.currentScreen = 'sprites';
    this.navSuppressed = false;
    this.navSaveMode = false;
    this.navBar?.setButtons(NAV_BUTTONS);
    this.navBar?.deactivate(); // focus starts on the screen content, not the nav
    this.refreshNav();

    this.spriteEditScreen.on('back', () => {
      this.state.sprites = this.spriteEditScreen!.collectSprites();
      this.showLibraryScreen(w, h);
    });

    this.spriteEditScreen.on(
      'go-to-frames',
      (payload: { spriteId: string; currentFrames: string[] }) => {
        this.state.sprites = this.spriteEditScreen!.collectSprites();
        this.pendingFrameTarget = payload.spriteId;
        this.showFrameSelectorScreen(w, h, payload.currentFrames);
      },
    );
  }

  // ── S3 – Frame Selector ────────────────────────────────────────────────────

  private showFrameSelectorScreen(w: number, h: number, currentFrames: string[]) {
    this.spriteEditScreen?.setVisible(false);
    this.spriteEditScreen?.pause(); // mute S2's keyboard while S3 is open
    this.frameSelectorScreen?.destroy();

    // S3 is a modal sub-screen with its own nav; hide the shared bottom nav.
    this.currentScreen = 'frames';
    this.refreshNav();

    this.frameSelectorScreen = new FrameSelectorScreen(
      this, w, h, this.state.images, currentFrames,
    );

    const returnToSpriteEdit = () => {
      this.currentScreen = 'sprites';
      this.refreshNav();
    };

    this.frameSelectorScreen.on('cancel', () => {
      this.frameSelectorScreen?.destroy();
      this.frameSelectorScreen = undefined;
      this.pendingFrameTarget = undefined;
      this.spriteEditScreen?.setVisible(true);
      this.spriteEditScreen?.resume();
      returnToSpriteEdit();
    });

    this.frameSelectorScreen.on('confirm', (payload: { frameIds: string[] }) => {
      const targetId = this.pendingFrameTarget;
      this.frameSelectorScreen?.destroy();
      this.frameSelectorScreen = undefined;
      this.pendingFrameTarget = undefined;
      this.spriteEditScreen?.setVisible(true);
      if (targetId) this.spriteEditScreen?.applyFrames(targetId, payload.frameIds);
      this.spriteEditScreen?.resume();
      returnToSpriteEdit();
    });
  }

  private async handleExport() {
    try {
      const artifacts = await buildSpriteEditorExport(this, this.state);
      downloadSpriteEditorExport(artifacts);

      if (artifacts.renamedPrefixes.length > 0) {
        console.warn('[SpriteEditor] Duplicate prefixes were renamed for export.', artifacts.renamedPrefixes);
      }

      console.log('[SpriteEditor] Exported spritesheet.png, spritesheet.json, animations.json');
    } catch (error) {
      console.error('[SpriteEditor] Export failed', error);
      const msg = error instanceof Error ? error.message : 'Unknown export error';
      this.showBanner(`Export failed: ${msg}`);
    }
  }

  private resolveApplyAtlasId(): string {
    // When launched from the Pet the target atlas is authoritative; the free-text
    // project name is only a display label. Fall back to it for standalone use.
    const target = (this.targetAtlasId || '').trim();
    if (target) return target;
    return this.state.projectName.trim();
  }

  /** In-canvas banner at the bottom of the screen; auto-hides after a moment. */
  private showBanner(message: string, isError = true) {
    if (!this.errorBanner) {
      this.errorBanner = this.add.text(this.scale.width / 2, this.scale.height - 4, '', {
        fontFamily: FONT.FAMILY,
        fontSize: FONT.SIZE,
        color: hex(COLORS.TEXT),
        backgroundColor: '#ffffff',
        padding: { x: 4, y: 2 },
        align: 'center',
        wordWrap: { width: this.scale.width - 8 },
      }).setOrigin(0.5, 1).setDepth(1000);
    }
    this.errorBanner
      .setColor(hex(isError ? COLORS.ERROR : COLORS.TEXT))
      .setText(message)
      .setVisible(true);
    this.time.delayedCall(BANNER_AUTOHIDE_MS, () => this.errorBanner?.setVisible(false));
  }

  private async handleApply() {
    try {
      const atlasId = this.resolveApplyAtlasId();
      if (!atlasId) {
        throw new Error('Apply requires atlasId. Set project name to the target atlasId.');
      }

      const configuredAtlases = getStaticData<Array<{ atlasId?: string }>>('assets.atlases') || [];
      if (
        configuredAtlases.length > 0 &&
        !configuredAtlases.some((item) => item?.atlasId === atlasId)
      ) {
        throw new Error(`Unknown atlasId: ${atlasId}. Set project name to a valid assets.atlases atlasId.`);
      }

      const artifacts = await buildSpriteEditorExport(this, this.state);
      await saveAtlasCustomization({
        atlasId,
        spritesheetPng: artifacts.spritesheetPng,
        spritesheetJson: artifacts.spritesheetJson as unknown as Record<string, unknown>,
        animations: artifacts.animations,
      });
      setCustomizationActive(true, atlasId);

      if (artifacts.renamedPrefixes.length > 0) {
        console.warn('[SpriteEditor] Duplicate prefixes were renamed for apply.', artifacts.renamedPrefixes);
      }

      console.log(`[SpriteEditor] Applied customization for atlas: ${atlasId}`);

      if (this.returnSceneKey) {
        // Hot-reload the atlas into the running game so the change is visible
        // immediately; the localStorage write still covers a manual page reload.
        try {
          await reloadAtlasIntoScene(this, atlasId);
        } catch (reloadError) {
          console.warn(
            '[SpriteEditor] Live reload failed; change will apply on next page load.',
            reloadError,
          );
        }
        this.scene.start(this.returnSceneKey, {
          statusMessage: `Applied: ${atlasId}`,
        });
        return;
      }

      this.showBanner(`Applied customization for atlas: ${atlasId}`, false);
    } catch (error) {
      console.error('[SpriteEditor] Apply failed', error);
      const msg = error instanceof Error ? error.message : 'Unknown apply error';
      this.showBanner(`Apply failed: ${msg}`);
    }
  }
}
