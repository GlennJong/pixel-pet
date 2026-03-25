import { Scene } from "phaser";
import { runTween } from "@/game/utils/runTween";

const maskCoverColor = 0x000000;
const DURATION = 1000;

export class TransitionScene extends Scene {
  private visibleArea!: Phaser.GameObjects.Arc;
  private circleMaxSize!: number;

  constructor() {
    super("TransitionScene");
  }

  create() {
    this.scene.bringToTop(); // Make absolutely sure it's always the topmost scene

    const { zoom } = this.scale;
    const { width, height } = this.sys.game.canvas;

    this.circleMaxSize = Math.max(width * zoom, height * zoom);

    const coverRect = this.add
      .rectangle(0, 0, width * zoom, height * zoom, maskCoverColor)
      .setOrigin(0)
      .setDepth(9999)
      .setVisible(true);

    const visibleArea = this.add
      .circle(width / 2, height / 2, 0, maskCoverColor)
      .setDepth(9999)
      .setVisible(false);

    this.visibleArea = visibleArea;

    const mask = visibleArea.createGeometryMask();

    mask.invertAlpha = true;
    coverRect.setMask(mask);
    
    // Default to fully covered (radius 0) so it hides the initial loading of subsequent scenes
    this.initCover();
  }

  public initCover() {
    this.visibleArea.setRadius(0);
  }

  public setMax() {
    this.visibleArea.setRadius(this.circleMaxSize);
  }

  public async runMask() {
    this.setMax();
    await runTween(this.visibleArea, { radius: 0 }, DURATION);
  }

  // Equivalent to runUnmask in original code
  public async runUnmask() {
    this.initCover();
    await runTween(this.visibleArea, { radius: this.circleMaxSize }, DURATION);
  }
}
