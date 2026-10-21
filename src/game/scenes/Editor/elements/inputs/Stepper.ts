import Phaser from 'phaser';
import { COLORS, cjkStyle, hex } from '../../constants';

/**
 * One labelled row of a form:
 *
 *   生命      < +10 >     arrows: the value changes with ◀/▶
 *   演出  eat ▸ work      no arrows: Enter opens it elsewhere
 *
 * Shows a value; does not own it. The owner applies the change and calls
 * {@link setValue}, so the shown value is always the stored one.
 */
export class Stepper extends Phaser.GameObjects.Container {
  private readonly labelText: Phaser.GameObjects.Text;
  private readonly valueText: Phaser.GameObjects.Text;
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly rowW: number;
  private readonly arrows: boolean;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    arrows = true,
  ) {
    super(scene, x, y);
    this.rowW = width;
    this.arrows = arrows;
    const style = cjkStyle();
    this.bg = scene.add.rectangle(0, 0, width, height, COLORS.CARD_BG).setOrigin(0, 0);
    this.labelText = scene.add.text(2, height / 2, label, style).setOrigin(0, 0.5);
    this.valueText = scene.add.text(width - 2, height / 2, '', style).setOrigin(1, 0.5);
    this.add([this.bg, this.labelText, this.valueText]);
  }

  setValue(text: string) {
    const wrap = (s: string) => (this.arrows ? `< ${s} >` : s);
    // Whatever is left of the row after the label; a value that does not fit
    // is cut short rather than drawn over its label.
    const room = this.rowW - this.labelText.width - 10;
    let shown = text;
    this.valueText.setText(wrap(shown));
    while (this.valueText.width > room && shown.length > 1) {
      shown = shown.slice(0, -1);
      this.valueText.setText(wrap(`${shown}…`));
    }
  }

  setFocused(on: boolean) {
    this.bg.setFillStyle(on ? COLORS.BUTTON_FOCUSED_BG : COLORS.CARD_BG);
    const color = hex(on ? COLORS.TEXT_BUTTON : COLORS.TEXT);
    this.labelText.setColor(color);
    this.valueText.setColor(color);
  }
}
