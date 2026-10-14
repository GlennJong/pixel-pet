import Phaser, { Scene } from 'phaser';
import { SpriteEditScreen } from './screens/SpriteEditScreen';
import { EditorState, WorkspaceAtlasEntry } from './types';
import { ScreenHost } from './navigation/ScreenHost';
import { NAV_MODES, SCREENS } from './navigation/registry';
import { EditorApp } from './navigation/types';
import { buildSpriteEditorExport, downloadSpriteEditorExport } from './utils/export';
import { removeEditorImageTextures } from './utils/texture';
import { loadEditableAtlasList } from './utils/template';
import { loadWorkspaceAtlasProject } from './utils/workspaceAtlas';
import { saveAtlasCustomization, setCustomizationActive, reloadAtlasIntoScene } from '@/game/customization';
import { getStaticData } from '@/game/staticData';
import { AtlasEntry } from '@/game/assets';
import { COLORS, FONT, BANNER_AUTOHIDE_MS, hex } from './constants';
import { GameConfigProject } from './action/GameConfigProject';
import { gameConfigFromStaticData } from '@/game/gameConfig/fromStaticData';
import { createAnimationsFromConfig, resolveAtlasAnimations } from '@/game/utils/animation';

const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

interface EditorSceneStartData {
  returnSceneKey?: string;
  targetAtlasId?: string;
}

/**
 * EditorScene – Sprite Editor
 *
 * Renders at the live game canvas size (this.scale.width/height), so the UI
 * always matches whatever resolution the host game runs at — no canvas resize.
 *
 * The scene no longer decides what is on screen. It owns the *project* (the
 * atlas being edited, its images and sprite configs) and the operations on it —
 * load, apply, export — and hands them to a {@link ScreenHost}, which runs the
 * navigation described in `navigation/registry.ts`. To change which screen
 * follows which, or which buttons a screen offers, edit that file; this one only
 * gains code when the editor learns to *do* something new.
 *
 * Scene key: 'Editor'
 */
export default class EditorScene extends Scene implements EditorApp {
  private host?: ScreenHost;
  private returnSceneKey?: string;
  private targetAtlasId?: string;

  private errorBanner?: Phaser.GameObjects.Text;
  private bootText?: Phaser.GameObjects.Text;
  /** Set on SHUTDOWN so async work drops its result instead of touching a dead scene. */
  private disposed = false;

  private atlasList: WorkspaceAtlasEntry[] = [];
  /**
   * The atlas the user picked. Authoritative for APPLY: `targetAtlasId` only
   * says which atlas the caller *launched* the editor for, and the picker lets
   * them choose another.
   */
  private selectedAtlas?: WorkspaceAtlasEntry;

  private state: EditorState = { projectName: '', images: [], sprites: [] };
  /**
   * The game config the basic editor changes. Re-read from the loaded game on
   * every start: edits live in memory only until saving exists.
   */
  private config?: GameConfigProject;

  constructor() {
    super('Editor');
  }

  init(data: EditorSceneStartData) {
    this.returnSceneKey = data?.returnSceneKey;
    this.targetAtlasId = data?.targetAtlasId;
    this.disposed = false;
    this.atlasList = [];
    this.selectedAtlas = undefined;
    this.state = { projectName: this.targetAtlasId || '', images: [], sprites: [] };
    const files = gameConfigFromStaticData();
    this.config = files ? new GameConfigProject(files) : undefined;
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;
    this.add.rectangle(0, 0, w, h, COLORS.BG).setOrigin(0, 0);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    void this.boot(w, h);
  }

  update() {
    this.host?.update();
  }

  // ── Boot ───────────────────────────────────────────────────────────────────

  /**
   * The atlas list has to exist before the first screen can be built — the
   * picker *is* that list — so it is loaded here rather than inside a screen.
   */
  private async boot(w: number, h: number) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this.showBootText(w, h);
    try {
      this.atlasList = await loadEditableAtlasList();
    } catch (error) {
      console.error('[Editor] Could not read the atlas list', error);
      this.clearBootText();
      this.showBanner(`Could not read the atlas list: ${describeError(error)}`);
      return;
    }
    if (this.disposed) return;
    this.clearBootText();

    if (this.atlasList.length === 0) {
      this.showBanner('No editable atlas in configs/assets.json');
      return;
    }

    // Not a choice, just a hint: the picker opens with the cursor on the atlas
    // the caller targeted, and the user is free to pick another.
    this.selectedAtlas = this.atlasList.find((a) => a.atlasId === (this.targetAtlasId || '').trim());

    // The basic editor previews the character's animations, which the game
    // only registers once the Pet scene has run. Registering is idempotent.
    if (this.config) {
      const atlasId = this.config.characterAtlasId;
      createAnimationsFromConfig(this, atlasId, resolveAtlasAnimations(atlasId));
    }

    this.host = new ScreenHost(
      {
        scene: this,
        width: w,
        height: h,
        registry: SCREENS,
        navModes: NAV_MODES,
        context: {
          scene: this,
          width: w,
          height: h,
          data: this.state,
          atlasList: this.atlasList,
          // A getter, not a snapshot: the picker sets it mid-session.
          get selectedAtlas() { return self.selectedAtlas; },
          config: this.config,
          characterAnimations: () => this.characterAnimations(),
          app: this,
          exitEditor: () => this.exitEditor(),
          banner: (message, isError) => this.showBanner(message, isError),
        },
      },
      // Without a game config there is nothing for the basic editor to change,
      // so the sprite picker is the way in.
      this.config ? { screen: 'groups' } : { screen: 'picker' },
    );
  }

  // ── EditorApp — what the editor knows how to do ────────────────────────────

  /**
   * Load a picked atlas into the project and show the sprite editor.
   *
   * Failure is not fatal: fall back to the library, which can still build a
   * project by hand, and say why on the banner.
   */
  async openAtlas(atlas: WorkspaceAtlasEntry): Promise<void> {
    const w = this.scale.width;
    const h = this.scale.height;
    this.showBootText(w, h);

    try {
      const project = await loadWorkspaceAtlasProject(this, atlas);
      if (this.disposed) return;

      this.selectedAtlas = atlas;
      this.state.projectName = project.projectName || atlas.atlasId;
      this.state.images = project.images;
      this.state.sprites = project.sprites;

      if (project.warnings.length > 0) {
        console.warn(`[Editor] ${atlas.atlasId} loaded with warnings:`, project.warnings);
      }

      this.clearBootText();
      this.host?.go({ screen: 'sprites' });
    } catch (error) {
      if (this.disposed) return;
      console.error(`[Editor] Could not load ${atlas.atlasId}`, error);
      this.clearBootText();
      this.host?.go({ screen: 'library' });
      this.showBanner(`Could not load ${atlas.displayName || atlas.atlasId}: ${describeError(error)}`);
    }
  }

  commitSprites(): void {
    const screen = this.host?.activeScreen as SpriteEditScreen | undefined;
    if (screen instanceof SpriteEditScreen) this.state.sprites = screen.collectSprites();
  }

  canLeaveLibrary(): boolean {
    const screen = this.host?.activeScreen as { canProceed?: boolean } | undefined;
    return screen?.canProceed === true;
  }

  /**
   * Re-point the sprite cards at the current image pool.
   *
   * Covers the parked screen as well as the active one: the frame selector
   * deletes images while the sprite list sits behind it, and that list's preview
   * animations hold the textures being destroyed. They are rebuilt the moment
   * the pool changes, not when the user comes back — a hidden sprite still
   * advances its animation.
   */
  syncImages(): void {
    [this.host?.activeScreen, this.host?.coveredScreen()].forEach((screen) => {
      if (screen instanceof SpriteEditScreen) screen.setImages(this.state.images);
    });
  }

  applyFrames(spriteId: string, frameIds: string[]): void {
    const screen = this.host?.activeScreen as SpriteEditScreen | undefined;
    if (screen instanceof SpriteEditScreen) screen.applyFrames(spriteId, frameIds);
  }

  async exportArtifacts(): Promise<void> {
    try {
      const artifacts = await buildSpriteEditorExport(this, this.state);
      downloadSpriteEditorExport(artifacts);

      if (artifacts.renamedPrefixes.length > 0) {
        console.warn('[Editor] Duplicate prefixes were renamed for export.', artifacts.renamedPrefixes);
      }
      console.log('[Editor] Exported spritesheet.png, spritesheet.json, animations.json');
    } catch (error) {
      console.error('[Editor] Export failed', error);
      this.showBanner(`Export failed: ${describeError(error)}`);
    }
  }

  async applyCustomization(): Promise<void> {
    try {
      const atlasId = this.resolveApplyAtlasId();
      if (!atlasId) {
        throw new Error('Apply requires atlasId. Set project name to the target atlasId.');
      }

      const configuredAtlases = getStaticData<AtlasEntry[]>('assets.atlases') || [];
      if (configuredAtlases.length > 0) {
        const target = configuredAtlases.find((item) => item?.atlasId === atlasId);
        if (!target) {
          throw new Error(`Unknown atlasId: ${atlasId}. Set project name to a valid assets.atlases atlasId.`);
        }
        // The whitelist is the last line of defence: an atlas can also be reached
        // by typing its id into the project name, not just by picking it from the
        // (already filtered) list.
        if (target.editable !== true) {
          throw new Error(`Atlas "${atlasId}" is not editable.`);
        }
      }

      const artifacts = await buildSpriteEditorExport(this, this.state);
      await saveAtlasCustomization({
        atlasId,
        spritesheetPng: artifacts.spritesheetPng,
        spritesheetJson: artifacts.spritesheetJson as unknown as Record<string, unknown>,
        animations: artifacts.animations,
        displayName: this.selectedAtlas?.displayName,
        description: this.selectedAtlas?.description,
      });
      setCustomizationActive(true, atlasId);

      if (artifacts.renamedPrefixes.length > 0) {
        console.warn('[Editor] Duplicate prefixes were renamed for apply.', artifacts.renamedPrefixes);
      }
      console.log(`[Editor] Applied customization for atlas: ${atlasId}`);

      if (this.returnSceneKey) {
        // Hot-reload the atlas into the running game so the change is visible
        // immediately; the localStorage write still covers a manual page reload.
        try {
          await reloadAtlasIntoScene(this, atlasId);
        } catch (reloadError) {
          console.warn(
            '[Editor] Live reload failed; change will apply on next page load.',
            reloadError,
          );
        }
        this.scene.start(this.returnSceneKey, { statusMessage: `Applied: ${atlasId}` });
        return;
      }

      this.showBanner(`Applied customization for atlas: ${atlasId}`, false);
    } catch (error) {
      console.error('[Editor] Apply failed', error);
      this.showBanner(`Apply failed: ${describeError(error)}`);
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /** Animation names in the character's atlas, in the order the atlas lists them. */
  private characterAnimations(): string[] {
    const atlasId = this.config?.characterAtlasId;
    if (!atlasId) return [];
    // The preloader merges every atlas's animations.json in here.
    const list = getStaticData<{ prefix: string }[] | undefined>(`assets.animationsByAtlas.${atlasId}`);
    return (list ?? []).map((a) => a.prefix);
  }

  private resolveApplyAtlasId(): string {
    // What the user picked wins: `targetAtlasId` is only the atlas the caller
    // launched the editor for, and the picker lets them choose another —
    // preferring the launch hint would write the edit into the wrong atlas.
    const picked = (this.selectedAtlas?.atlasId || '').trim();
    if (picked) return picked;
    const target = (this.targetAtlasId || '').trim();
    if (target) return target;
    return this.state.projectName.trim();
  }

  private exitEditor() {
    this.scene.start(this.returnSceneKey || 'MainScene');
  }

  private showBootText(w: number, h: number) {
    if (this.bootText) return;
    this.bootText = this.add.text(w / 2, h / 2, 'Loading…', {
      fontFamily: FONT.FAMILY,
      fontSize: FONT.SIZE,
      color: hex(COLORS.TEXT),
    }).setOrigin(0.5).setDepth(400);
  }

  private clearBootText() {
    this.bootText?.destroy();
    this.bootText = undefined;
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

  private handleShutdown() {
    this.disposed = true;
    this.clearBootText();
    this.host?.destroy();
    this.host = undefined;
    // Final teardown: free every editor_img_* texture. This is done here (not in
    // a screen's destroy) because screens are destroyed/recreated on navigation
    // round-trips where the textures must survive.
    removeEditorImageTextures(this);
  }
}
