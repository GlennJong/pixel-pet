import Phaser from "phaser";
import { runTween } from "../utils/runTween";

const maskCoverColor = 0x000000;
const DURATION = 1000;

export async function sceneConverter(
  scene: Phaser.Scene,
  nextSceneName?: string,
  data?: { [key: string]: unknown },
) {
  const { scene: sceneController } = scene;
  const cover = new CircleScreenTransition(scene);

  cover.max();
  await cover.runMask();

  // move to next scene
  if (typeof nextSceneName !== "undefined") {
    sceneController.start(nextSceneName, data);
  }
}

export async function sceneStarter(scene: Phaser.Scene) {
  const cover = new CircleScreenTransition(scene);

  cover.init();
  await cover.runUnmask();
}

class CircleScreenTransition extends Phaser.GameObjects.Container {
  private visibleArea: Phaser.GameObjects.Arc;
  private curcleMaxSize: number;

  constructor(scene: Phaser.Scene) {
    super(scene);

    const { zoom } = scene.scale;
    const { width, height } = scene.sys.game.canvas;

    this.curcleMaxSize = Math.max(width * zoom, height * zoom);

    const coverRect = scene.add
      .rectangle(0, 0, width * zoom, height * zoom, maskCoverColor)
      .setOrigin(0)
      .setDepth(9999)
      .setVisible(true);

    const visibleArea = scene.add
      .circle(width / 2, height / 2, 0, maskCoverColor)
      .setVisible(false);

    this.visibleArea = visibleArea;

    const mask = visibleArea.createGeometryMask();

    mask.invertAlpha = true;
    coverRect.setMask(mask);
    this.setDepth(9999);
  }

  public init() {
    this.visibleArea.setRadius(0);
  }

  public max() {
    this.visibleArea.setRadius(this.curcleMaxSize);
  }

  public async run() {
    await runTween(this.visibleArea, { radius: 0 }, DURATION);
    return;
  }

  public async runMask() {
    await runTween(this.visibleArea, { radius: 0 }, DURATION);
    return;
  }
  public async runUnmask() {
    await runTween(this.visibleArea, { radius: 200 }, DURATION);
    return;
  }
}
