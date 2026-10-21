import Phaser from 'phaser';
import { Direction } from '@/game/ui/focus';
import { COLORS, cjkStyle, hex } from '../../constants';
import { FocusableCursorList } from './FocusableCursorList';
import type { OptionMenuItem } from './OptionMenu';

const ROW_H = 18;
const ROW_H_WITH_DESC = 26;
const ROW_GAP = 2;
const TEXT_PAD_X = 4;
/** How long the list takes to glide to a new scroll position, ms. */
const SCROLL_MS = 120;

/**
 * A vertical list that fills its area and scrolls smoothly, like the sprite
 * card column: every row is drawn, rows at the edges are cut off rather than
 * left out, and moving the cursor glides the list to keep it in view.
 *
 * The cut-off row at the bottom is the point: it shows there is more below.
 *
 * Same contract as OptionMenu, so a screen can use either.
 *
 * Events emitted:
 *   'select' (key: string) – a row was activated
 *   'request-focus'        – pointer entered/pressed; owner should focus this list
 */
export class ScrollList extends FocusableCursorList {
  private readonly content: Phaser.GameObjects.Container;
  private readonly clip: Phaser.GameObjects.Graphics;
  private readonly viewW: number;
  private readonly viewH: number;

  private items: OptionMenuItem[] = [];
  private rows: { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text; desc?: Phaser.GameObjects.Text }[] = [];
  private rowH = ROW_H;
  private _cursorIndex = 0;
  private scrollY = 0;
  private scrollTween?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number, items: OptionMenuItem[]) {
    super(scene, x, y);
    this.viewW = width;
    this.viewH = height;
    this.content = scene.add.container(0, 0);
    this.add(this.content);

    // Clip to the list's area. The mask lives in world space; screens sit at
    // the origin, so the list's own position is its world position.
    this.clip = scene.make.graphics({}, false);
    this.clip.fillStyle(0xffffff);
    this.clip.fillRect(x, y, width, height);
    this.content.setMask(this.clip.createGeometryMask());

    scene.add.existing(this);
    this.setItems(items);
  }

  get cursorIndex() { return this._cursorIndex; }

  setItems(items: OptionMenuItem[]) {
    this.rows.forEach((r) => { r.bg.destroy(); r.label.destroy(); r.desc?.destroy(); });
    this.items = [...items];
    this.rowH = items.some((i) => i.description) ? ROW_H_WITH_DESC : ROW_H;

    this.rows = items.map((item, i) => {
      const top = i * (this.rowH + ROW_GAP);
      const bg = this.scene.add.rectangle(0, top, this.viewW, this.rowH, COLORS.GRID_AREA_BG)
        .setOrigin(0, 0)
        .setInteractive({ cursor: 'pointer' });
      // Rows cut off by the mask still take pointer events; only the visible
      // part of a row may respond.
      const visible = (p: Phaser.Input.Pointer) => p.y >= this.y && p.y < this.y + this.viewH;
      bg.on('pointerover', (p: Phaser.Input.Pointer) => {
        if (!visible(p)) return;
        this.emit('request-focus');
        this.setCursor(i);
      });
      bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (!visible(p)) return;
        this.emit('request-focus');
        this.setCursor(i);
        this.selectCurrent();
      });
      const twoLine = !!item.description;
      const label = this.scene.add.text(TEXT_PAD_X, top + (twoLine ? 7 : this.rowH / 2), item.label, cjkStyle())
        .setOrigin(0, 0.5);
      const desc = twoLine
        ? this.scene.add.text(TEXT_PAD_X, top + 19, item.description!, cjkStyle(COLORS.TEXT_DISABLED)).setOrigin(0, 0.5)
        : undefined;
      this.content.add([bg, label, ...(desc ? [desc] : [])]);
      return { bg, label, desc };
    });

    this._cursorIndex = Phaser.Math.Clamp(this._cursorIndex, 0, Math.max(0, items.length - 1));
    this.scrollTo(this.targetScroll(), false);
    this.refreshVisuals();
  }

  setCursor(index: number) {
    this._cursorIndex = Phaser.Math.Clamp(index, 0, Math.max(0, this.items.length - 1));
    this.scrollTo(this.targetScroll(), true);
    this.refreshVisuals();
  }

  selectCurrent() {
    const item = this.items[this._cursorIndex];
    if (item) this.emit('select', item.key);
  }

  destroy(fromScene?: boolean) {
    this.scrollTween?.stop();
    this.clip.destroy();
    super.destroy(fromScene);
  }

  // ── FocusableCursorList ──────────────────────────────────────────────────

  protected onFocusChange() { this.refreshVisuals(); }

  protected moveCursorIn(dir: Direction): boolean {
    const next = this._cursorIndex + (dir === 'DOWN' ? 1 : dir === 'UP' ? -1 : 0);
    if (dir !== 'UP' && dir !== 'DOWN') return false; // horizontal → out of the list
    if (next < 0 || next >= this.items.length) return false;
    this.setCursor(next);
    return true;
  }

  protected homeCursor(edge: 'first' | 'last') {
    this.setCursor(edge === 'first' ? 0 : this.items.length - 1);
  }

  protected activateCursor() { this.selectCurrent(); }

  /** Route by the visible area: the content is taller than the list. */
  protected focusBounds(): Phaser.Geom.Rectangle {
    const m = this.getWorldTransformMatrix();
    return new Phaser.Geom.Rectangle(m.tx, m.ty, this.viewW, this.viewH);
  }

  // ── Private ──────────────────────────────────────────────────────────────

  /** The least scrolling that shows the cursor's row in full. */
  private targetScroll(): number {
    const top = this._cursorIndex * (this.rowH + ROW_GAP);
    const bottom = top + this.rowH;
    const contentH = this.items.length * (this.rowH + ROW_GAP) - ROW_GAP;
    let y = this.scrollY;
    if (top < y) y = top;
    else if (bottom > y + this.viewH) y = bottom - this.viewH;
    return Phaser.Math.Clamp(y, 0, Math.max(0, contentH - this.viewH));
  }

  private scrollTo(y: number, animate: boolean) {
    if (y === this.scrollY && !this.scrollTween) return;
    this.scrollY = y;
    this.scrollTween?.stop();
    this.scrollTween = undefined;
    if (!animate) { this.content.setY(-y); return; }
    this.scrollTween = this.scene.tweens.add({
      targets: this.content,
      y: -y,
      duration: SCROLL_MS,
      ease: 'Sine.easeOut',
      onComplete: () => { this.scrollTween = undefined; },
    });
  }

  private refreshVisuals() {
    this.rows.forEach((r, i) => {
      const on = this._hasFocus && i === this._cursorIndex;
      r.bg.setFillStyle(on ? COLORS.BUTTON_FOCUSED_BG : COLORS.GRID_AREA_BG);
      r.bg.setStrokeStyle(1, on ? COLORS.BUTTON_FOCUSED_BORDER : COLORS.INPUT_BORDER_DEFAULT, 1);
      r.label.setColor(hex(on ? COLORS.TEXT_BUTTON : COLORS.TEXT));
      // The dim second line is unreadable on the focused row's dark fill.
      r.desc?.setColor(hex(on ? COLORS.TEXT_BUTTON : COLORS.TEXT_DISABLED));
    });
  }
}
