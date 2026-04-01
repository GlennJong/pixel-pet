import { getStaticData } from "@/game/staticData";
import Phaser from "phaser";
import { HeaderConfig, HeaderSelectorOption } from "./types";
import { PET_STATIC_KEYS } from "../../constants";

export class HeaderSelector extends Phaser.GameObjects.Container {
  private config: HeaderConfig;
  private arrow!: Phaser.GameObjects.Sprite;
  private icon!: Phaser.GameObjects.Sprite;
  private frameName: string;

  constructor(scene: Phaser.Scene, option: HeaderSelectorOption) {
    // Inherite from scene
    super(scene);

    this.config = getStaticData(PET_STATIC_KEYS.HEADER);

    this.initAnimations();

    const { frame } = option;

    this.frameName = frame;
  }

  private initAnimations = () => {
    const { key, animations } = this.config;
    if (animations) {
      animations.forEach((_ani: import("../../types/common").AnimationItem) => {
        const animationName = `${key}_${_ani.prefix}`;
        if (this.scene.anims.exists(animationName)) return; // prevent recreate after change scene.

        const data: Phaser.Types.Animations.Animation = {
          key: animationName,
          frames: this.scene.anims.generateFrameNames(key, {
            prefix: `${_ani.prefix}_`,
            start: 1,
            end: _ani.qty,
          }),
          repeat: _ani.repeat,
        };

        if (typeof _ani.freq !== "undefined") data.frameRate = _ani.freq;
        if (typeof _ani.duration !== "undefined") data.duration = _ani.duration;
        const repeatDelay = _ani.repeatDelay ?? _ani.repeat_delay;
        if (typeof repeatDelay !== "undefined") data.repeatDelay = repeatDelay;

        this.scene.anims.create(data);
      });
    }
  };

  public select() {
    this.arrow.visible = true;
    this.icon.play(`${this.frameName}_anim`);
  }

  public unselect() {
    this.arrow.visible = false;
    this.icon.anims.complete();
    this.icon.setFrame(`${this.frameName}-default`);
  }

  public destroy() {
    this.icon.destroy();
    this.arrow.destroy();
  }
}
