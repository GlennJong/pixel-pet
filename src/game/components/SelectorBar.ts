import Phaser from "phaser";

export interface SelectorBarInset {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface SelectorBarStyle {
  /** Texture atlas key holding the nineslice frame (and optional arrow). */
  atlas: string;
  /** Nineslice frame name within the atlas. */
  frame: string;
  /** Corner insets in px — a single number for uniform, or per-side. */
  inset: number | SelectorBarInset;
  /** Flat fill color used when the atlas/frame is unavailable. */
  fallbackColor?: number;
  /** Selection-arrow frame within the atlas. Omit to disable the arrow. */
  arrowFrame?: string;
}

export interface SelectorBarLayout {
  /** Which edge items pack against. Default 'left'. */
  align?: "left" | "right";
  /** Inner padding from the left edge (px). */
  padLeft?: number;
  /** Inner padding from the right edge (px). */
  padRight?: number;
  /** Gap between adjacent items on a page (px). */
  gap?: number;
}

export interface SelectorBarItem {
  /** Display object for the item; SelectorBar owns its position + visibility. */
  object: Phaser.GameObjects.Container;
  /** Measured width of the item (px), used for pagination + placement. */
  width: number;
}

interface Placed {
  cell: Phaser.GameObjects.Container;
  width: number;
  page: number;
  x: number;
}

/**
 * Reusable framed selection bar. Draws a pixel-art nineslice window frame
 * (with a graceful flat-rectangle fallback) and lays a horizontal row of items
 * across it. When the items exceed the available width they are split into
 * pages; only the current page is shown and a selection arrow marks the focused
 * item. Moving the selection past a page boundary flips the visible page — the
 * pagination model lifted from the Pet Header (see Pet/elements/Header).
 *
 * Style-agnostic: callers supply the atlas/frame/insets and the item objects,
 * so any scene can reuse it as a selectable bar. Emits 'select' (index:number)
 * whenever the selection changes.
 *
 * The container origin is the panel's top-left corner (local 0,0).
 */
export class SelectorBar extends Phaser.GameObjects.Container {
  /** True when the nineslice frame + arrow are in use (false → flat fallback). */
  readonly hasFrame: boolean;
  readonly frameWidth: number;
  readonly frameHeight: number;

  private align: "left" | "right";
  private readonly padLeft: number;
  private readonly padRight: number;
  private readonly gap: number;
  private readonly centerY: number;

  private arrow?: Phaser.GameObjects.Image;
  private items: Placed[] = [];
  private _selectedIndex = 0;
  private _pageCount = 1;
  private _currentPage = 0;
  private _focused = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    style: SelectorBarStyle,
    layout: SelectorBarLayout = {},
  ) {
    super(scene, x, y);
    this.frameWidth = width;
    this.frameHeight = height;
    this.centerY = Math.floor(height / 2);
    this.align = layout.align ?? "left";
    this.padLeft = layout.padLeft ?? 0;
    this.padRight = layout.padRight ?? 0;
    this.gap = layout.gap ?? 0;
    this.hasFrame = SelectorBar.isAvailable(scene, style);

    if (this.hasFrame) {
      const i =
        typeof style.inset === "number"
          ? { left: style.inset, right: style.inset, top: style.inset, bottom: style.inset }
          : style.inset;
      const nine = scene.make
        .nineslice({
          key: style.atlas,
          frame: style.frame,
          x: 0,
          y: 0,
          width,
          height,
          leftWidth: i.left,
          rightWidth: i.right,
          topHeight: i.top,
          bottomHeight: i.bottom,
        })
        .setOrigin(0, 0);
      this.add(nine);

      if (style.arrowFrame && scene.textures.get(style.atlas).has(style.arrowFrame)) {
        this.arrow = scene.make
          .image({ key: style.atlas, frame: style.arrowFrame }, false)
          // Anchor by the arrow's right edge so it sits just left of its target.
          .setOrigin(1, 0.5)
          .setVisible(false);
        this.add(this.arrow);
      }
    } else {
      const rect = scene.add
        .rectangle(0, 0, width, height, style.fallbackColor ?? 0x000000)
        .setOrigin(0, 0);
      this.add(rect);
    }
  }

  /** Whether `style`'s atlas is loaded and contains its frame. */
  static isAvailable(scene: Phaser.Scene, style: SelectorBarStyle): boolean {
    if (!scene.textures.exists(style.atlas)) return false;
    return scene.textures.get(style.atlas).has(style.frame);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get selectedIndex() { return this._selectedIndex; }
  get pageCount() { return this._pageCount; }
  get currentPage() { return this._currentPage; }
  get isFocused() { return this._focused; }

  /** Replace all items; recomputes pagination and re-renders the current view. */
  setItems(items: SelectorBarItem[]) {
    this.items.forEach((it) => it.cell.destroy());
    this.items = items.map((it) => ({ cell: it.object, width: it.width, page: 0, x: 0 }));
    this.items.forEach((it) => this.add(it.cell));
    // Keep the arrow above the item cells so it stays visible.
    if (this.arrow) this.bringToTop(this.arrow);

    this.paginate();
    this._selectedIndex = Phaser.Math.Clamp(this._selectedIndex, 0, Math.max(0, this.items.length - 1));
    this._currentPage = this.items[this._selectedIndex]?.page ?? 0;
    this.render();
  }

  setSelectedIndex(index: number) {
    if (this.items.length === 0) return;
    const next = Phaser.Math.Clamp(index, 0, this.items.length - 1);
    if (next === this._selectedIndex && this.items[next].page === this._currentPage) return;
    this._selectedIndex = next;
    this._currentPage = this.items[next].page;
    this.render();
    this.emit("select", this._selectedIndex);
  }

  moveSelection(delta: number) {
    this.setSelectedIndex(this._selectedIndex + delta);
  }

  selectFirst() { this.setSelectedIndex(0); }
  selectLast() { this.setSelectedIndex(this.items.length - 1); }

  /** Focus shows the arrow (framed) — callers own any non-framed affordance. */
  setFocused(focused: boolean) {
    this._focused = focused;
    this.render();
  }

  /** Change which edge items pack against; re-lays out the current items. */
  setAlign(align: "left" | "right") {
    if (this.align === align) return;
    this.align = align;
    this.paginate();
    this.render();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /** Greedily pack items into pages by width, then place each page's items. */
  private paginate() {
    const avail = this.frameWidth - this.padLeft - this.padRight;

    const pages: number[][] = [];
    let current: number[] = [];
    let used = 0;
    this.items.forEach((it, i) => {
      const needed = current.length === 0 ? it.width : this.gap + it.width;
      if (current.length > 0 && used + needed > avail) {
        pages.push(current);
        current = [];
        used = 0;
      }
      it.page = pages.length;
      current.push(i);
      used += current.length === 1 ? it.width : this.gap + it.width;
    });
    if (current.length > 0) pages.push(current);
    this._pageCount = Math.max(1, pages.length);

    pages.forEach((idxs) => {
      const pageWidth = idxs.reduce(
        (sum, i, k) => sum + this.items[i].width + (k > 0 ? this.gap : 0),
        0,
      );
      let x =
        this.align === "right"
          ? this.frameWidth - this.padRight - pageWidth
          : this.padLeft;
      idxs.forEach((i) => {
        this.items[i].x = x;
        x += this.items[i].width + this.gap;
      });
    });
  }

  /** Position/show items for the current page and point the arrow at the selection. */
  private render() {
    this.items.forEach((it) => {
      it.cell.setPosition(it.x, 0);
      it.cell.setVisible(it.page === this._currentPage);
    });

    if (this.arrow) {
      const sel = this.items[this._selectedIndex];
      if (this._focused && sel && sel.page === this._currentPage) {
        this.arrow.setPosition(sel.x - 1, this.centerY).setVisible(true);
      } else {
        this.arrow.setVisible(false);
      }
    }
  }
}
