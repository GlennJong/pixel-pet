import Phaser, { Scene } from 'phaser';
import { LibraryScreen } from './screens/LibraryScreen';
import { SpriteEditScreen } from './screens/SpriteEditScreen';
import { FrameSelectorScreen } from './screens/FrameSelectorScreen';
import { EditorState, LibraryProceedPayload, SpriteData } from './types';
import { buildSpriteEditorExport, downloadSpriteEditorExport } from './utils/export';
import { buildPresetSpritesFromImages } from './utils/smartInput';
import { saveAtlasCustomization, setCustomizationActive, reloadAtlasIntoScene } from '@/game/customization';
import { getStaticData } from '@/game/staticData';
import { COLORS, FONT, BANNER_AUTOHIDE_MS, hex } from './constants';

interface EditorSceneStartData {
  returnSceneKey?: string;
  targetAtlasId?: string;
}

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
export default class EditorScene extends Scene {
  private libraryScreen?: LibraryScreen;
  private spriteEditScreen?: SpriteEditScreen;
  private frameSelectorScreen?: FrameSelectorScreen;
  private returnSceneKey?: string;
  private targetAtlasId?: string;

  private errorBanner?: Phaser.GameObjects.Text;

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
    this.showLibraryScreen(w, h);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
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
    this.libraryScreen = undefined;
    this.spriteEditScreen = undefined;
    this.frameSelectorScreen = undefined;
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
    });
    this.libraryScreen.on('proceed', (data: LibraryProceedPayload) => {
      this.state.projectName = data.projectName;
      this.state.images = data.images;
      if (typeof data.sprites !== 'undefined') {
        this.state.sprites = data.sprites;
      }
      this.showSpriteEditScreen(w, h);
    });
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
      this, w, h, this.state.images, this.state.sprites,
    );

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

    this.spriteEditScreen.on('export', (sprites: SpriteData[]) => {
      this.state.sprites = sprites;
      void this.handleExport();
    });

    this.spriteEditScreen.on('apply', (sprites: SpriteData[]) => {
      this.state.sprites = sprites;
      void this.handleApply();
    });
  }

  // ── S3 – Frame Selector ────────────────────────────────────────────────────

  private showFrameSelectorScreen(w: number, h: number, currentFrames: string[]) {
    this.spriteEditScreen?.setVisible(false);
    this.spriteEditScreen?.pause(); // mute S2's keyboard while S3 is open
    this.frameSelectorScreen?.destroy();

    this.frameSelectorScreen = new FrameSelectorScreen(
      this, w, h, this.state.images, currentFrames,
    );

    this.frameSelectorScreen.on('cancel', () => {
      this.frameSelectorScreen?.destroy();
      this.frameSelectorScreen = undefined;
      this.pendingFrameTarget = undefined;
      this.spriteEditScreen?.setVisible(true);
      this.spriteEditScreen?.resume();
    });

    this.frameSelectorScreen.on('confirm', (payload: { frameIds: string[] }) => {
      const targetId = this.pendingFrameTarget;
      this.frameSelectorScreen?.destroy();
      this.frameSelectorScreen = undefined;
      this.pendingFrameTarget = undefined;
      this.spriteEditScreen?.setVisible(true);
      if (targetId) this.spriteEditScreen?.applyFrames(targetId, payload.frameIds);
      this.spriteEditScreen?.resume();
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
