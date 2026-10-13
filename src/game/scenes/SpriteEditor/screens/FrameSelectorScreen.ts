import Phaser from 'phaser';
import { GridSelector, GridCellData } from '../elements';
import { ScreenKeyboard } from '@/game/ui';
import { FocusRouter, createScope } from '@/game/ui/focus';
import { EditorScreen } from './EditorScreen';
import { ImageFilePicker, importImageFiles } from '../utils/imageLibrary';
import {
  COLORS,
  BUTTON_BAR_HEIGHT,
  GRID_OUTER_PAD,
} from '../constants';
import { EditorState, NavHost } from '../types';

/**
 * S3 – FrameSelectorScreen
 *
 * Picks the frames of one animation, and manages the material they come from.
 * Both jobs live here because they are the same moment: "this needs a frame I
 * do not have yet" is answered where the gap is noticed, not on another screen.
 *
 * Two modes, which the bottom bar reflects (see navigation/registry.ts):
 *
 *   pick  – tick images to use as frames. ADD imports more, EDIT switches mode.
 *   edit  – tick images to delete. DELETE / CANCEL return to pick.
 *
 * The grid has one notion of "selected", so entering edit mode parks the frame
 * selection and restores it on the way out: ticking something for deletion must
 * not quietly drop it from the animation.
 *
 * Images already used by this animation are laid out first, in frame order, so
 * the current state of the animation is visible without hunting for it.
 *
 * Navigation is driven by the shared {@link FocusRouter}: the grid and the bar
 * are two focusables; geometry moves between them and boundary overrides wrap.
 *
 * Events emitted:
 *   'cancel'
 *   'confirm' ({ frameIds: string[] })
 *   'mode'    (mode: 'pick' | 'edit')  – the bar's buttons depend on it
 *   'error'   (message: string)
 */
export type FrameSelectorMode = 'pick' | 'edit';

export class FrameSelectorScreen extends EditorScreen {
  private grid!: GridSelector;
  private readonly router = new FocusRouter();
  private readonly navHost: NavHost;
  private readonly project: EditorState;
  private readonly picker: ImageFilePicker;

  private mode: FrameSelectorMode = 'pick';
  /** The frame picks, held across a trip through edit mode. */
  private parkedFrames: string[] = [];
  /** True while an import is in flight, so ADD cannot be re-entered. */
  private importing = false;

  constructor(
    scene: Phaser.Scene,
    width: number,
    height: number,
    project: EditorState,
    currentFrames: string[],
    navHost: NavHost,
  ) {
    super(scene);
    this.navHost = navHost;
    this.project = project;

    const buttonBarY = height - BUTTON_BAR_HEIGHT;
    const gridH = buttonBarY - GRID_OUTER_PAD;

    this.add(scene.add.rectangle(0, 0, width, height, COLORS.BG).setOrigin(0, 0));

    this.grid = new GridSelector(scene, {
      x: 0,
      y: 0,
      width,
      height: gridH,
      hasAddCell: false,
    });
    this.add(this.grid);
    this.grid.setCells(this.buildCells(currentFrames));

    this.picker = new ImageFilePicker((files) => void this.importFiles(files));

    this.setupFocus();

    this.keyboard = new ScreenKeyboard({
      scene,
      canAttach: () => this.active,
      deferAttach: true,
      onKeyDown: (code: string) => this.router.handleKey(code),
    });

    scene.add.existing(this);
    this.keyboard.attach();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  get currentMode(): FrameSelectorMode { return this.mode; }
  /** Ticked cells: the frame picks in pick mode, the deletion marks in edit. */
  get selectedIds(): string[] { return this.grid.selectedIds; }
  get selectedCount(): number { return this.grid.selectedIds.length; }
  get busy(): boolean { return this.importing; }

  /** Open the file dialog. Must be called straight from a user gesture. */
  addImages() {
    if (this.importing) return;
    this.picker.open();
  }

  enterEditMode() {
    if (this.mode === 'edit') return;
    // Park rather than recompute: the picks are the user's, and re-deriving
    // them from the sprite would discard edits made since the screen opened.
    this.parkedFrames = this.grid.selectedIds;
    this.grid.clearAllSelections();
    this.setMode('edit');
  }

  leaveEditMode() {
    if (this.mode === 'pick') return;
    this.restoreFrameSelection(this.parkedFrames);
    this.setMode('pick');
  }

  /**
   * Bring the grid back in line after the project has dropped `removed`.
   *
   * Call order matters and is the caller's job: the grid is rebuilt from
   * `project.images`, so the project must already be the shorter list. Doing it
   * the other way round puts the deleted cells straight back, pointing at
   * textures that are about to be destroyed.
   */
  afterDelete(removed: readonly string[]) {
    const gone = new Set(removed);
    this.parkedFrames = this.parkedFrames.filter((id) => !gone.has(id));
    this.restoreFrameSelection(this.parkedFrames);
    this.setMode('pick');
  }

  update() { /* event-driven */ }

  destroy(fromScene?: boolean) {
    this.picker.destroy();
    super.destroy(fromScene);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  /**
   * Images already in the animation come first, in frame order, then the rest
   * in library order. Opening on "what this animation currently is" beats
   * opening on a wall of thumbnails with the answer scattered through it.
   */
  private buildCells(currentFrames: readonly string[]): GridCellData[] {
    // One map rather than indexOf per image: that would be O(images × frames).
    const orderById = new Map(currentFrames.map((id, i) => [id, i]));
    const rank = (id: string) => orderById.get(id) ?? Number.MAX_SAFE_INTEGER;

    return [...this.project.images]
      .sort((a, b) => rank(a.id) - rank(b.id))
      .map((img) => {
        const frameIdx = orderById.get(img.id) ?? -1;
        return {
          id: img.id,
          type: 'image' as const,
          textureKey: img.textureKey,
          selected: frameIdx >= 0,
          selectionOrder: frameIdx >= 0 ? frameIdx + 1 : undefined,
        };
      });
  }

  private setMode(mode: FrameSelectorMode) {
    this.mode = mode;
    this.router.focusId('grid');
    this.emit('mode', mode);
  }

  /** Re-tick the parked picks, preserving their order. */
  private restoreFrameSelection(frameIds: readonly string[]) {
    this.grid.clearAllSelections();
    this.grid.setCells(this.buildCellsFromCurrent(frameIds));
  }

  /** Cells for the images still present, ticked per `frameIds`, order kept. */
  private buildCellsFromCurrent(frameIds: readonly string[]): GridCellData[] {
    const orderById = new Map(frameIds.map((id, i) => [id, i]));
    return this.project.images.map((img) => {
      const frameIdx = orderById.get(img.id) ?? -1;
      return {
        id: img.id,
        type: 'image' as const,
        textureKey: img.textureKey,
        selected: frameIdx >= 0,
        selectionOrder: frameIdx >= 0 ? frameIdx + 1 : undefined,
      };
    });
  }

  private async importFiles(files: File[]) {
    this.importing = true;
    try {
      const added = await importImageFiles(this.scene, files, this.project.images);
      this.project.images = [...this.project.images, ...added];
      added.forEach((img) => this.grid.addImageCell({ id: img.id, textureKey: img.textureKey }));
      // Land on the first new image: the user asked for these, so show them
      // rather than leaving the cursor wherever it happened to be.
      this.grid.setCursor(this.grid.cellCount - added.length);
      this.router.focusId('grid');
    } catch (error) {
      this.emit('error', error instanceof Error ? error.message : String(error));
    } finally {
      this.importing = false;
    }
  }

  private setupFocus() {
    // Pointer events take router focus first, so mouse and keyboard agree.
    this.grid.on('request-focus', () => this.router.focusId('grid'));

    const grid = this.grid.asFocusable('grid', {
      handleKey: (code) => {
        if (code !== 'Enter') return false;
        // Enter means "done with this screen", which in edit mode is the
        // destructive action — so it only confirms the frame picks.
        if (this.mode === 'pick') this.emit('confirm', { frameIds: this.grid.selectedIds });
        return true;
      },
    });

    // The bottom bar belongs to the scene, not to this screen — see
    // navigation/registry.ts for its buttons. We only borrow it as a focusable.
    const bar = this.navHost.buildNavFocusable(
      (edge) => this.router.focusEdge(edge, 'nav'),
      () => this.router.focusId('nav'),
    );

    const scope = createScope({
      id: 'frame-selector',
      members: () => [grid, bar],
      // Escape backs out of edit mode first; only then does it leave the screen.
      onCancel: () => {
        if (this.mode === 'edit') this.leaveEditMode();
        else this.emit('cancel');
      },
      boundaryOverride: {
        UP: () => this.router.focusId('nav', 'UP'),     // grid-top ↑ → bar
        DOWN: () => this.router.focusId('grid', 'DOWN'), // bar ↓ → grid-top
      },
    });

    this.router.setBaseScope(scope, 'grid');
  }
}
