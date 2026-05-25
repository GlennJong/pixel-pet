import { Scene } from 'phaser';
import { LibraryScreen } from './screens/LibraryScreen';
import { SpriteEditScreen } from './screens/SpriteEditScreen';
import { FrameSelectorScreen } from './screens/FrameSelectorScreen';
import { EditorState, LibraryProceedPayload, SpriteData } from './types';
import { buildSpriteEditorExport, downloadSpriteEditorExport } from './utils/export';
import { buildPresetSpritesFromImages } from './utils/smartInput';

/**
 * EditorScene – Sprite Editor
 *
 * Designed for a 320×240 canvas. Use StartEditorGame() from game/index.ts
 * to launch it with the correct resolution.
 *
 * Screen flow: S1 LibraryScreen ↔ S2 SpriteEditScreen ↔ S3 FrameSelectorScreen
 *
 * Scene key: 'SpriteEditor'
 */
export default class EditorScene extends Scene {
  private libraryScreen?: LibraryScreen;
  private spriteEditScreen?: SpriteEditScreen;
  private frameSelectorScreen?: FrameSelectorScreen;

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

  create() {
    const w = this.scale.width;
    const h = this.scale.height;
    this.add.rectangle(0, 0, w, h, 0xf0f0f0).setOrigin(0, 0);
    this.showLibraryScreen(w, h);
  }

  update() {
    this.libraryScreen?.update();
    this.spriteEditScreen?.update();
    this.frameSelectorScreen?.update();
  }

  shutdown() {
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
      if (typeof window !== 'undefined') {
        const msg = error instanceof Error ? error.message : 'Unknown export error';
        window.alert(`Export failed: ${msg}`);
      }
    }
  }
}
