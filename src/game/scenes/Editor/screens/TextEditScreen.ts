import Phaser from 'phaser';
import { ScreenKeyboard } from '@/game/ui';
import { FocusRouter, createScope, makeFocusable } from '@/game/ui/focus';
import { DomTextInput } from '../elements/DomTextInput';
import { COLORS, BUTTON_BAR_HEIGHT, cjkStyle } from '../constants';
import { NavHost } from '../types';
import { EditorScreen } from './EditorScreen';

const PAD = 3;
const TITLE_H = 14;
const HINT_H = 12;
const CARET_W = 2;
const LINE_SPACING = 2;
/** One fade out and back in, ms. */
const CARET_BLINK_MS = 1000;

/**
 * Writing one line of dialogue, on a screen of its own: the whole line,
 * wrapped, with a caret, above SAVE / CANCEL.
 *
 * Typing starts straight away, and Enter is a line break. Saving is the bottom
 * bar's job, as on every screen: ↓ with the caret at the end of the text (or ↑
 * at its start) moves there, and coming back from the bar resumes typing.
 *
 * Events emitted:
 *   'cancel'
 */
export class TextEditScreen extends EditorScreen {
  private readonly router = new FocusRouter();
  private readonly typer: DomTextInput;
  private readonly text: Phaser.GameObjects.Text;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly caret: Phaser.GameObjects.Rectangle;
  private readonly probe: Phaser.GameObjects.Text;
  private readonly lineH: number;
  private blink?: Phaser.Tweens.Tween;
  private readonly area: Phaser.Geom.Rectangle;
  private typing = false;

  constructor(scene: Phaser.Scene, width: number, height: number, title: string, value: string, navHost: NavHost) {
    super(scene);
    this.add(scene.add.rectangle(0, 0, width, height, COLORS.BG).setOrigin(0, 0));
    this.add(scene.add.text(PAD, 2, title, cjkStyle()));

    const areaH = height - BUTTON_BAR_HEIGHT - TITLE_H - HINT_H - PAD;
    this.area = new Phaser.Geom.Rectangle(PAD, TITLE_H, width - PAD * 2, areaH);
    this.add(scene.add.rectangle(this.area.x, this.area.y, this.area.width, this.area.height, COLORS.INPUT_BG).setOrigin(0, 0));
    const style = {
      ...cjkStyle(),
      // Chinese has no spaces to break at; advanced wrap breaks anywhere.
      wordWrap: { width: this.area.width - 4, useAdvancedWrap: true },
      lineSpacing: LINE_SPACING,
    };
    this.text = scene.add.text(this.area.x + 2, this.area.y + 2, '', style);
    // Lays out the text up to the caret, to find where the caret goes.
    this.probe = scene.add.text(0, 0, '', style).setVisible(false);
    this.lineH = this.probe.setText('A\nA').height - this.probe.setText('A').height;
    this.caret = scene.add.rectangle(0, 0, CARET_W, this.probe.height, COLORS.TEXT).setOrigin(0, 0).setVisible(false);
    this.frame = scene.add.graphics();
    this.add([this.text, this.caret, this.frame, this.probe]);

    this.typer = new DomTextInput(scene, {
      area: this.area,
      value,
      onChange: (v, caret) => this.draw(v, caret),
      onExit: () => {
        this.typer.blur();
        this.router.focusId('nav');
      },
      onCancel: () => this.emit('cancel'),
      onFocusChange: (on) => {
        this.typing = on;
        // Clicked into: the router follows, so keys and highlight agree.
        if (on) this.router.focusId('text');
        // While typing, this screen must not react to the same keys. Resuming
        // waits a tick so the key that stopped typing is not read again.
        if (on) this.pauseInput();
        else this.scene.time.delayedCall(0, () => this.resumeInput());
        this.draw(this.typer.value, this.typer.value.length);
      },
    });

    // The keyboard exists before focus starts typing, so typing can pause it.
    this.keyboard = new ScreenKeyboard({
      scene,
      canAttach: () => this.active,
      deferAttach: true,
      onKeyDown: (code: string) => this.router.handleKey(code),
    });
    scene.add.existing(this);
    this.keyboard.attach();
    this.setupFocus(navHost);

    this.draw(value, value.length);
  }

  /** The line as written so far. */
  get draft() { return this.typer.value; }

  update() { /* event-driven */ }

  destroy(fromScene?: boolean) {
    this.blink?.stop();
    this.typer.close();
    super.destroy(fromScene);
  }

  private draw(value: string, caret: number) {
    this.text.setText(value);
    this.placeCaret(value, caret);
    this.frame.clear();
    this.frame.lineStyle(1, this.typing ? COLORS.CARD_FOCUSED_BORDER : COLORS.INPUT_BORDER_DEFAULT, 1);
    this.frame.strokeRect(this.area.x + 0.5, this.area.y + 0.5, this.area.width - 1, this.area.height - 1);
  }

  /**
   * A bar drawn at the caret rather than a character typed into the text: a
   * character at a line's end is where wrapping breaks, and it vanished there.
   * Solid while typing, then it fades in and out.
   */
  private placeCaret(value: string, caret: number) {
    this.blink?.stop();
    this.caret.setVisible(this.typing).setAlpha(1);
    if (!this.typing) return;

    const lines = this.probe.setText(value.slice(0, caret)).getWrappedText();
    const last = lines[lines.length - 1] ?? '';
    const x = last ? this.probe.setText(last).width : 0;
    this.caret.setPosition(this.text.x + x, this.text.y + (lines.length - 1) * this.lineH);

    this.blink = this.scene.tweens.add({
      targets: this.caret,
      alpha: 0.1,
      delay: CARET_BLINK_MS / 2,
      duration: CARET_BLINK_MS / 2,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  private setupFocus(navHost: NavHost) {
    const text = makeFocusable({
      id: 'text',
      object: { getBounds: () => this.area },
      // Focus on the text is typing in it, and leaving it stops typing — the
      // highlight and where keys go are never two different places.
      onFocus: () => this.typer.focus(),
      onBlur: () => this.typer.blur(),
      onSelect: () => this.typer.focus(),
    });
    const bar = navHost.buildNavFocusable(
      (edge) => this.router.focusEdge(edge, 'text'),
      () => this.router.focusId('nav'),
    );
    this.router.setBaseScope(createScope({
      id: 'text-edit',
      members: () => [text, bar],
      onCancel: () => this.emit('cancel'),
      // No wrap from the bar back down into the text: with the caret at the
      // end, ↓ there leaves again, and focus would bounce between the two.
      // The bar is left by ↑, which the geometry already does.
    }), 'text');
  }
}
