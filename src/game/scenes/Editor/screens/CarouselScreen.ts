import Phaser from 'phaser';
import { ScreenKeyboard } from '@/game/ui';
import { FocusRouter, createScope, makeFocusable } from '@/game/ui/focus';
import { AnimationPreview } from '../elements/AnimationPreview';
import { COLORS, cjkStyle } from '../constants';
import { NavHost } from '../types';
import { EditorScreen } from './EditorScreen';

export interface CarouselShowcase {
  /** What the page's preview is labelled with while it plays ("站立"). */
  label: string;
  parts: string[];
}

export interface CarouselPage {
  key: string;
  title: string;
  description: string;
  /** Played one after another, round and round. */
  showcase: CarouselShowcase[];
}

const PAD = 4;
const ARROW_W = 5;
const ARROW_H = 9;
const PREVIEW_W = 104;
const PREVIEW_H = 56;
/** Rest on a finished preview before moving on to the next, ms. */
const SHOWCASE_HOLD_MS = 700;

/**
 * One page per entry, each filling the screen; ◀/▶ turns the page.
 *
 * A page is a title, a preview that plays every showcase of the page in turn
 * with its label underneath, and a short description. The arrows at the sides
 * say Left/Right turns; they dim while the bottom bar has focus.
 *
 * Events emitted:
 *   'select' (key: string) – Enter on a page
 *   'cancel'               – Escape
 */
export class CarouselScreen extends EditorScreen {
  private readonly router = new FocusRouter();
  private readonly pages: CarouselPage[];
  private readonly atlasId: string;

  private readonly title: Phaser.GameObjects.Text;
  private readonly preview: AnimationPreview;
  private readonly label: Phaser.GameObjects.Text;
  private readonly description: Phaser.GameObjects.Text;
  private readonly arrows: Phaser.GameObjects.Triangle[];

  private page = 0;
  private showcase = 0;
  private hold?: Phaser.Time.TimerEvent;

  constructor(
    scene: Phaser.Scene,
    width: number,
    height: number,
    atlasId: string,
    pages: CarouselPage[],
    navHost: NavHost,
    focusKey?: string,
  ) {
    super(scene);
    this.pages = pages;
    this.atlasId = atlasId;

    this.add(scene.add.rectangle(0, 0, width, height, COLORS.BG).setOrigin(0, 0));

    const cx = width / 2;
    this.title = scene.add.text(cx, 3, '', cjkStyle()).setOrigin(0.5, 0);

    const px = Math.round((width - PREVIEW_W) / 2);
    const py = 18;
    this.preview = new AnimationPreview(scene, px, py, PREVIEW_W, PREVIEW_H);
    this.preview.on('complete', () => this.queueNextShowcase());

    this.label = scene.add.text(cx, py + PREVIEW_H + 3, '', cjkStyle(COLORS.X_BTN_TEXT)).setOrigin(0.5, 0);

    const descTop = py + PREVIEW_H + 18;
    this.description = scene.add.text(cx, descTop, '', {
      ...cjkStyle(),
      align: 'center',
      wordWrap: { width: width - PAD * 2, useAdvancedWrap: true },
      lineSpacing: 1,
    }).setOrigin(0.5, 0);

    // Triangles, not the cursor sprite: crisp at any size and point either way.
    const ay = py + PREVIEW_H / 2;
    this.arrows = [-1, 1].map((dir) => {
      const x = dir < 0 ? PAD + ARROW_W / 2 : width - PAD - ARROW_W / 2;
      const tip = (dir * ARROW_W) / 2;
      const arrow = scene.add.triangle(x, ay, -tip, -ARROW_H / 2, -tip, ARROW_H / 2, tip, 0, COLORS.TEXT)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      arrow.on('pointerdown', () => { this.router.focusId('page'); this.turn(dir); });
      return arrow;
    });

    this.preview.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, PREVIEW_W, PREVIEW_H),
      Phaser.Geom.Rectangle.Contains,
    );
    this.preview.on('pointerdown', () => this.emit('select', this.pages[this.page]?.key));

    this.add([this.title, this.preview, this.label, this.description, ...this.arrows]);

    this.page = Math.max(0, pages.findIndex((p) => p.key === focusKey));
    this.showPage();

    this.setupFocus(navHost);
    this.keyboard = new ScreenKeyboard({
      scene,
      canAttach: () => this.active,
      deferAttach: true,
      onKeyDown: (code: string) => this.router.handleKey(code),
    });

    scene.add.existing(this);
    this.keyboard.attach();
  }

  update() { /* event-driven */ }

  destroy(fromScene?: boolean) {
    this.hold?.remove();
    super.destroy(fromScene);
  }

  private turn(dir: number) {
    const n = this.pages.length;
    if (n < 2) return;
    this.page = (this.page + dir + n) % n;
    this.showPage();
  }

  private showPage() {
    const page = this.pages[this.page];
    if (!page) return;
    this.title.setText(`${page.title}  ${this.page + 1}/${this.pages.length}`);
    this.description.setText(page.description);
    this.showcase = 0;
    this.playShowcase();
  }

  private playShowcase() {
    this.hold?.remove();
    this.hold = undefined;
    const item = this.pages[this.page]?.showcase[this.showcase];
    this.label.setText(item?.label ?? '');
    this.preview.setSequence(this.atlasId, item?.parts ?? []);
  }

  private queueNextShowcase() {
    const count = this.pages[this.page]?.showcase.length ?? 0;
    if (count === 0) return;
    this.hold?.remove();
    this.hold = this.scene.time.delayedCall(SHOWCASE_HOLD_MS, () => {
      this.showcase = (this.showcase + 1) % count;
      this.playShowcase();
    });
  }

  private setArrowsLit(lit: boolean) {
    for (const a of this.arrows) a.setAlpha(lit ? 1 : 0.35);
  }

  private setupFocus(navHost: NavHost) {
    const page = makeFocusable({
      id: 'page',
      object: { getBounds: () => this.preview.getBounds() },
      onFocus: () => this.setArrowsLit(true),
      onBlur: () => this.setArrowsLit(false),
      onSelect: () => this.emit('select', this.pages[this.page]?.key),
      handleDirection: (dir) => {
        if (dir === 'LEFT') { this.turn(-1); return true; }
        if (dir === 'RIGHT') { this.turn(1); return true; }
        return false;
      },
    });
    const bar = navHost.buildNavFocusable(
      (edge) => this.router.focusEdge(edge, 'nav'),
      () => this.router.focusId('nav'),
    );
    this.router.setBaseScope(createScope({
      id: 'carousel-screen',
      members: () => [page, bar],
      onCancel: () => this.emit('cancel'),
      boundaryOverride: {
        UP: () => this.router.focusId('nav', 'UP'),
        DOWN: () => this.router.focusId('page', 'DOWN'),
      },
    }), 'page');
  }
}
