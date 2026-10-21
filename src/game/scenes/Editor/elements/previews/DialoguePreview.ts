import Phaser from 'phaser';
import { PrimaryDialogue } from '@/game/components/PrimaryDialogue';
import { getStaticData } from '@/game/staticData';
import { animationKey } from '@/game/assets';
import { COLORS } from '../../constants';

export type DialoguePart = 'face' | 'text';

/** The game's dialogue box: a framed portrait, and a framed text box beside it. */
const FACE_FRAME = 40;
export const DIALOGUE_HEIGHT = 40;

/**
 * A line as the player will see it: the game's own dialogue box, typing the
 * line out once and then holding its last page. {@link replay} types it again.
 *
 * Two parts take focus — the face and the text; the owner moves between them
 * and decides what Enter does on each.
 */
export class DialoguePreview extends Phaser.GameObjects.Container {
  private readonly dialogue: PrimaryDialogue;
  private readonly highlight: Phaser.GameObjects.Graphics;
  private readonly textW: number;
  private readonly atlasId: string;

  private face = '';
  private text = '';
  private sample: (text: string) => string = (t) => t;
  private run = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, atlasId: string) {
    super(scene, x, y);
    this.textW = width - FACE_FRAME;
    this.atlasId = atlasId;

    this.dialogue = new PrimaryDialogue(scene);
    this.dialogue.initDialogue({
      ...(getStaticData<Record<string, unknown>>('global.dialogue') ?? {}),
      frameKey: getStaticData<string>('global.dialogue.frameKey'),
      frameFrame: getStaticData<string>('global.dialogue.frameFrame'),
      sceneWidth: width,
      sceneHeight: DIALOGUE_HEIGHT,
      portraitFrameSize: FACE_FRAME,
      dialogueWidth: this.textW,
      dialogueHeight: DIALOGUE_HEIGHT,
      x: 0,
      y: 0,
      embed: true,
    });
    this.highlight = scene.add.graphics();
    this.add([this.dialogue, this.highlight]);
  }

  /**
   * Show a line. `sample` fills its placeholders for display ({{user}} → a
   * name, {{coin}} → the amount), so it reads as it will in play.
   */
  setLine(face: string, text: string, sample: (text: string) => string) {
    this.face = face;
    this.text = text;
    this.sample = sample;
    this.replay();
  }

  setFocus(part: DialoguePart | null) {
    this.highlight.clear();
    if (!part) return;
    this.highlight.lineStyle(2, COLORS.CARD_FOCUSED_BORDER, 1);
    if (part === 'face') this.highlight.strokeRect(1, 1, FACE_FRAME - 2, DIALOGUE_HEIGHT - 2);
    else this.highlight.strokeRect(FACE_FRAME + 1, 1, this.textW - 2, DIALOGUE_HEIGHT - 2);
  }

  destroy(fromScene?: boolean) {
    this.run += 1; // a dialogue finishing after this must not touch the box
    this.dialogue.destroy();
    super.destroy(fromScene);
  }

  private get faceKey() { return animationKey(this.atlasId, this.face); }

  /** Type the line out from the start, then hold its last page. */
  replay() {
    const run = ++this.run;
    const line = this.sample(this.text);
    // The game's box cannot type out nothing; an empty line is just shown.
    if (!line.trim()) { this.dialogue.preview(this.faceKey, ''); return; }
    void this.dialogue.runDialogue([{ portrait: this.faceKey, text: line }]).then(() => {
      // The game's box closes when a line ends; here it stays, on its last page.
      if (run === this.run && this.scene) this.dialogue.preview(this.faceKey, line);
    });
  }
}
