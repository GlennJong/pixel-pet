import { TAnimation } from "@/game/components/Character";
import { ConfigManager } from "@/game/managers/ConfigManagers";
import Phaser from "phaser";

type TOption = {
  x: number;
  y: number;
  start: number;
  end: number;
  freq: number;
  key: string;
  frame: string;
};

export class HeaderSelector extends Phaser.GameObjects.Container {
  private config: any;
  private arrow?: Phaser.GameObjects.Sprite;
  private icon?: Phaser.GameObjects.Sprite;
  private frameName: string;

  constructor(scene: Phaser.Scene, option: TOption) {
    // Inherite from scene
    super(scene);

    this.config = ConfigManager.getInstance().get(`pet.header`);

    this.initAnimations();

    const { frame } = option;

    // Icon
    this.frameName = frame;
  }

  private initAnimations = () => {
    const { key, animations } = this.config;
    if (animations) {
      animations.forEach((_ani: TAnimation) => {
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
    if (this.arrow) {
      this.arrow.visible = true;
    };
    if (this.icon) {
      this.icon.play(`${this.frameName}_anim`);
    };
  }

  public unselect() {
    if (this.icon) {
      this.icon.anims.complete();
      this.icon.setFrame(`${this.frameName}-default`);
    };
    if (this.arrow) {
      this.arrow.visible = false;
    };
  }

  public destroy() {
    if (this.icon) this.icon.destroy();
    if (this.arrow) this.arrow.destroy();
  }
}
