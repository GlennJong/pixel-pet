import Phaser from 'phaser';
import { animationKey } from '@/game/assets';
import { COLORS } from '../constants';

/**
 * A box that plays a performance — a list of animations, one after another —
 * once, then rests on its last frame. {@link replay} plays it again.
 *
 * Once, not looping: a grid of looping previews is a wall of motion where
 * nothing stands out. Played on arrival and again when the cursor lands on
 * it, the focused one is the only thing moving.
 *
 * Each part plays once regardless of its own `repeat`, so a long idle loop
 * does not hold the preview on the first part — the point is to see the whole
 * chain, and how its parts join.
 */
export class AnimationPreview extends Phaser.GameObjects.Container {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly boxW: number;
  private readonly boxH: number;

  private atlasId = '';
  private parts: string[] = [];
  private index = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number) {
    super(scene, x, y);
    this.boxW = w;
    this.boxH = h;
    this.sprite = scene.add.sprite(w / 2, h / 2, '__DEFAULT').setVisible(false);
    this.sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.advance());
    this.add([scene.add.rectangle(0, 0, w, h, COLORS.PREVIEW_BG).setOrigin(0, 0), this.sprite]);
  }

  /** Show a performance and play it once. */
  setSequence(atlasId: string, parts: string[]) {
    this.atlasId = atlasId;
    this.parts = parts.filter((p) => this.scene.anims.exists(animationKey(atlasId, p)));
    this.replay();
  }

  /** Play the whole performance again from its first part. */
  replay() {
    this.index = 0;
    this.playPart();
  }

  destroy(fromScene?: boolean) {
    this.sprite.off(Phaser.Animations.Events.ANIMATION_COMPLETE);
    super.destroy(fromScene);
  }

  private advance() {
    // The last part stays on its final frame until the next replay.
    if (this.index >= this.parts.length - 1) return;
    this.index += 1;
    this.playPart();
  }

  private playPart() {
    const part = this.parts[this.index];
    if (!part) { this.sprite.setVisible(false); return; }

    this.sprite.setVisible(true);
    this.sprite.play({ key: animationKey(this.atlasId, part), repeat: 0 });

    // Whole-number upscaling only — pixel art blurs at anything else; a frame
    // larger than the box is shrunk to fit.
    const frame = this.sprite.frame;
    const fit = Math.min((this.boxW - 4) / frame.realWidth, (this.boxH - 4) / frame.realHeight);
    this.sprite.setScale(fit >= 1 ? Math.floor(fit) : fit);
  }
}
