import Phaser from "phaser";
import { canvas } from "../constants";
import { runTween } from "../utils/runTween";

const defaultWidth = canvas.width;
const defaultHeight = canvas.height;

export async function sceneConverter(
  scene: Phaser.Scene,
  nextSceneName: string,
) {
  const { scene: sceneController } = scene;
  const cover = new ScreenTransition(scene);
  await cover.run();
  sceneController.start(nextSceneName);
}

class ScreenTransition extends Phaser.GameObjects.Container {
  private cover?: Phaser.GameObjects.Image = undefined;

  constructor(scene: Phaser.Scene) {
    super(scene);

    const cover = scene.make
      .image({
        key: "transition-cover",
        x: defaultWidth / 2,
        y: defaultHeight / 2,
      })
      .setAlpha(0)
      .setOrigin(0.5)
      .setSize(defaultWidth, defaultHeight);

    this.cover = cover;
  }

  public async run() {
    if (!this.cover) return;
    await runTween(this.cover, { alpha: 1 }, 1000);
    return;
  }
}
