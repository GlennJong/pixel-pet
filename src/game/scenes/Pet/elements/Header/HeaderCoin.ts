import Phaser from "phaser";
import { runtimeData, ObservableValue } from "@/game/runtimeData";
import { PET_HEADER_TEXT_STYLE } from "../../constants";

const DEFAULT_COIN = 888;

export class IconCoin extends Phaser.GameObjects.Container {
  private coinState?: ObservableValue<number>;

  private text: Phaser.GameObjects.Text;
  private value: number;
  private targetValue: number | undefined;

  constructor(scene: Phaser.Scene, option: { x: number; y: number }) {
    super(scene);

    this.coinState = runtimeData(`pet.coin`);

    // Watch coin change
    this.value =
      typeof this.coinState?.get() === "number"
        ? this.coinState?.get()
        : DEFAULT_COIN;
    this.coinState?.watch(this.handleSetValue);

    const { x, y } = option;

    // Icon
    const coin = scene.make
      .sprite({
        key: "header",
        frame: "coin-1",
        x: x,
        y: y,
      })
      .setOrigin(0);
    if (!scene.anims.exists("coin")) {
      scene.anims.create({
        key: "coin",
        frames: scene.anims.generateFrameNames("header", {
          prefix: `coin-`,
          start: 1,
          end: 16,
        }),
        repeat: -1,
        frameRate: 6,
      });
    }

    coin.play("coin");
    this.add(coin);

    const text = scene.make
      .text({
        x: x + 12,
        y: y + 2,
        style: PET_HEADER_TEXT_STYLE,
      })
      .setOrigin(0);
    text.setResolution(4);

    this.text = text;
    this.add(text);

    this.text.setText(this.value.toString());
  }

  public handleSetValue = (value: number) => {
    console.log({ value });
    const resultValue = value <= 0 ? 0 : value;
    this.targetValue = resultValue;
  };

  public addValue(value: number) {
    const sum = this.value + value;
    const resultValue = sum <= 0 ? 0 : sum;

    this.targetValue = resultValue;
  }

  public update() {
    if (typeof this.targetValue === "undefined") return;

    if (this.targetValue > this.value) {
      this.value += 1;
    } else if (this.targetValue < this.value) {
      this.value -= 1;
    } else {
      this.targetValue = undefined;
    }

    this.text.setText(this.value.toString());
  }

  public destroy() {
    this.text.destroy();
    super.destroy();
  }
}
