import Phaser from "phaser";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "../constants";
import { runTween } from "../utils/runTween";

const defaultWidth = CANVAS_WIDTH;
const defaultHeight = CANVAS_HEIGHT;

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
  private cover: Phaser.GameObjects.Image;

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
    // scene.add.existing(this);
  }

  public async run() {
    await runTween(this.cover, { alpha: 1 }, 1000);
    return;
  }
}
