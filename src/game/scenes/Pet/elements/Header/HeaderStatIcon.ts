import Phaser from "phaser";
import { runtimeData } from "@/game/runtimeData";
import { KnownRuntimeDataKey } from "@/game/runtimeData/types";
import { PET_HEADER_TEXT_STYLE } from "../../constants";

const DEFAULT_VALUE = 0;

export class HeaderStatIcon extends Phaser.GameObjects.Container {
  private statState: ReturnType<typeof runtimeData>;
  private text: Phaser.GameObjects.Text;
  private value: number;
  private targetValue: number | undefined;

  constructor(
    scene: Phaser.Scene,
    option: { x: number; y: number; key: string; animation: string },
  ) {
    super(scene);

    const { x, y, key, animation } = option;
    this.statState = runtimeData(key as KnownRuntimeDataKey);
    this.value =
      typeof this.statState?.get() === "number"
        ? this.statState.get()
        : DEFAULT_VALUE;
    this.statState?.watch(this.handleSetValue);

    // Icon
    const icon = scene.make
      .sprite({
        key: "",
        frame: "",
        x: x,
        y: y,
      })
      .setOrigin(0);
    this.add(icon);
    icon.play(animation);

    // Text
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
    this.targetValue = value;
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
    this.statState?.unwatch(this.handleSetValue);
    this.text.destroy();
    super.destroy();
  }
}
