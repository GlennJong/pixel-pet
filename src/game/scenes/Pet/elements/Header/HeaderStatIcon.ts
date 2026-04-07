import Phaser from "phaser";
import { runtimeData } from "@/game/runtimeData";
import { KnownRuntimeDataKey } from "@/game/runtimeData/types";
import { PET_HEADER_TEXT_STYLE } from "../../constants";
import { StatItemConfig } from "./types";

const DEFAULT_VALUE = 0;

export class HeaderStatIcon extends Phaser.GameObjects.Container {
  private statState: ReturnType<typeof runtimeData>;
  private text: Phaser.GameObjects.Text;
  private icon: Phaser.GameObjects.Sprite;
  private value: number;
  private targetValue: number | undefined;
  private config: StatItemConfig;
  private atlasId: string;

  constructor(
    scene: Phaser.Scene,
    option: { x: number; y: number; key: string; config: StatItemConfig; atlasId: string },
  ) {
    super(scene);

    const { x, y, key, config, atlasId } = option;
    this.config = config;
    this.atlasId = atlasId;
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
    this.icon = icon;
    this.add(icon);
    this.updateIconDisplay(this.value);

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
    if (this.config.showValue === false) {
      this.text.setVisible(false);
    }
  }

  private updateIconDisplay(currentValue: number) {
    if (this.config.thresholds && this.config.thresholds.length > 0) {
      // Find the first threshold that the value satisfies assuming they are ordered descending
      const threshold = this.config.thresholds.find((t) => currentValue >= t.min);
      if (threshold) {
        if (threshold.animation) {
          this.icon.play(`${this.atlasId}_${threshold.animation}`);
        } else if (threshold.frame) {
          this.icon.setFrame(threshold.frame);
        }
      }
    } else if (this.config.animation) {
      this.icon.play(`${this.atlasId}_${this.config.animation}`);
    }
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
    this.updateIconDisplay(this.value);
  }

  public destroy() {
    this.statState?.unwatch(this.handleSetValue);
    this.text.destroy();
    super.destroy();
  }

  public getWidth(): number {
    if (this.config.showValue === false) {
      return this.icon.width > 0 ? this.icon.width : 16;
    }
    return 12 + this.text.width;
  }
}
