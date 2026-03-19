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
  private arrow: Phaser.GameObjects.Sprite;
  private icon: Phaser.GameObjects.Sprite;
  private frameName: string;

  constructor(scene: Phaser.Scene, option: TOption) {
    // Inherite from scene
    super(scene);

    this.config = ConfigManager.getInstance().get(`pet.header`);

    this.initAnimations();

    const { x, y, key, frame, start, end, freq } = option;

    // Icon
    // this.icon = scene.make.sprite({
    //   key: key,
    //   frame: `${frame}-default`,
    //   x: x,
    //   y: y,
    // }).setOrigin(0);

    this.frameName = frame;

    // Defind Icon Animation
    // if (!scene.anims.exists(`${frame}_anim`)) {
    //   scene.anims.create({
    //     key: `${frame}_anim`,
    //     frames: scene.anims.generateFrameNames(key, {
    //       prefix: `${frame}-`,
    //       start: start,
    //       end: end,
    //     }),
    //     repeat: -1,
    //     frameRate: freq,
    //   });
    // }

    // this.add(this.icon);

    // Arrow
    // this.arrow = scene.make.sprite({
    //   key: 'pet_header_icons',
    //   frame: 'arrow',
    //   x: x - 12,
    //   y: y,
    // }).setOrigin(0);

    // Defind Arrow Animation
    // scene.tweens.add({
    //   targets: this.arrow,
    //   repeat: -1,
    //   yoyo: true,
    //   ease: 'linear',
    //   duration: 500,
    //   alpha: 0,
    //   pause: true,
    // });

    // this.arrow.visible = false;
    // this.add(this.arrow);
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
