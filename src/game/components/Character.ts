import Phaser from "phaser";
import { AnimationItem } from "../scenes/Pet/types";

export type CharacterDirection = "none" | "left" | "right" | "top" | "down";

export type CharacterProps = {
  x: number;
  y: number;
  animations: AnimationItem[];
};

export class Character extends Phaser.GameObjects.Container {
  public character: Phaser.GameObjects.Sprite;

  private followShadow?: Phaser.GameObjects.Arc;
  private characterKey: string;

  constructor(scene: Phaser.Scene, key: string, props: CharacterProps) {
    super(scene);

    const { x, y, animations } = props;

    // load animation by key
    this.characterKey = key;

    if (animations) {
      animations.forEach((animConfig) => {
        const animationName = `${key}_${animConfig.prefix}`;
        if (scene.anims.exists(animationName)) return; // prevent recreate after change scene.

        const data: Phaser.Types.Animations.Animation = {
          key: animationName,
          frames: scene.anims.generateFrameNames(key, {
            prefix: `${animConfig.prefix}_`,
            start: 1,
            end: animConfig.qty,
          }),
          repeat: animConfig.repeat,
        };

        if (typeof animConfig.freq !== "undefined") data.frameRate = animConfig.freq;
        if (typeof animConfig.duration !== "undefined") data.duration = animConfig.duration;
        const repeatDelay = animConfig.repeatDelay ?? animConfig.repeat_delay;
        if (typeof repeatDelay !== "undefined") data.repeatDelay = repeatDelay;

        scene.anims.create(data);
      });
    }

    // create character
    const posX = x || 0;
    const posY = y || 0;
    const character = scene.add
      .sprite(posX, posY, key)
      .setScale(1)
      .setOrigin(0);

    this.character = character;
    scene.add.existing(this);
  }

  public playStatic(frame: string) {
    this.character.setTexture(this.characterKey, frame);
  }

  public setFollowShadow(shadow: Phaser.GameObjects.Arc) {
    this.followShadow = shadow;
  }

  private pendingResolves: Array<() => void> = [];

  public async playAnimation(key: string, time?: number): Promise<void> {
    return new Promise((resolve) => {
      const animationName = `${this.characterKey}_${key}`;
      const scene = this.scene as Phaser.Scene;
      if (!scene.anims.exists(animationName)) {
        console.warn(`Animation ${animationName} not found`);
        resolve();
        return;
      }
      this.character.play(animationName);

      const anim = scene.anims.get(animationName);
      if (
        anim &&
        (anim.repeat === -1 || anim.repeat === Number.POSITIVE_INFINITY) &&
        typeof time === "undefined"
      ) {
        resolve();
        return;
      }

      const onComplete = (anim: Phaser.Animations.Animation) => {
        if (anim.key === animationName) {
          if (typeof time !== "undefined") {
            setTimeout(() => {
              this.pendingResolves = this.pendingResolves.filter((r) => r !== resolve);
              resolve();
            }, time);
          } else {
            this.pendingResolves = this.pendingResolves.filter((r) => r !== resolve);
            resolve();
          }
          this.character.off("animationcomplete", onComplete);
        }
      };
      this.pendingResolves.push(resolve);
      this.character.on("animationcomplete", onComplete);
    });
  }

  // move action condition
  private currentMoveTween?: Phaser.Tweens.Tween;

  // moving
  public moveDirection(
    direction: CharacterDirection,
    distance: number,
    callbackFunc: () => void,
    duration: number = 1000,
  ) {
    if (this.currentMoveTween?.isPlaying()) return;

    let targetX = this.character.x;
    let targetY = this.character.y;

    if (direction === "left") {
      targetX -= distance;
    } else if (direction === "right") {
      targetX += distance;
    } else if (direction === "top") {
      targetY -= distance;
    } else if (direction === "down") {
      targetY += distance;
    }

    this.currentMoveTween = this.scene.tweens.add({
      targets: [this.character, this.followShadow].filter(Boolean),
      x: targetX,
      y: targetY,
      duration: duration,
      onComplete: () => {
        this.currentMoveTween = undefined;
        callbackFunc();
      },
    });
  }

  public stopAllActions() {
    this.character.stop(); // Stop current animation
    this.character.removeAllListeners("animationcomplete");
    // Resolve all pending animations so they don't block async flows
    this.pendingResolves.forEach((resolve) => resolve());
    this.pendingResolves = [];
    
    if (this.currentMoveTween?.isPlaying()) {
      this.currentMoveTween.stop();
      this.currentMoveTween = undefined;
    }
  }

  public updatePosition(): void {
    // Deprecated: Movement handled by Tweens
  }

  public destroy() {
    this.character.destroy();
  }
}
