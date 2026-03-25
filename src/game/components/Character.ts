import Phaser from "phaser";

export type Direction = "none" | "left" | "right" | "top" | "down";

export type TAnimation = {
  prefix: string;
  qty: number;
  freq: number;
  repeat: number;
  duration: number;
  repeatDelay?: number;
  repeat_delay?: number;
};

export type CharacterProps = {
  x: number;
  y: number;
  animations: TAnimation[];
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
      .setOrigin(0)
      .setVisible(false); // 預設隱藏，避免整張 spritesheet 在動畫準備好前被直接渲染成破圖

    this.character = character;
    scene.add.existing(this);
  }

  public playStatic(frame: string) {
    this.character.setVisible(true);
    this.character.setTexture(this.characterKey, frame);
  }

  public setFollowShadow(shadow: Phaser.GameObjects.Arc) {
    this.followShadow = shadow;
  }

  private pendingResolves: Array<() => void> = [];

  public changeTextureKey(newKey: string, animations?: TAnimation[]) {
    this.characterKey = newKey;
    
    if (animations) {
      animations.forEach((animConfig) => {
        const animationName = `${newKey}_${animConfig.prefix}`;
        if (this.scene.anims.exists(animationName)) return;

        const data: Phaser.Types.Animations.Animation = {
          key: animationName,
          frames: this.scene.anims.generateFrameNames(newKey, {
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

        this.scene.anims.create(data);
      });
    }
    
    if (this.character.texture.key !== newKey) {
      this.character.setTexture(newKey);
    }
  }

  public async playAnimation(key: string, time?: number): Promise<void> {
    return new Promise((resolve) => {
      const animationName = `${this.characterKey}_${key}`;
      const scene = this.scene as Phaser.Scene;
      if (!scene.anims.exists(animationName)) {
        console.warn(`Animation ${animationName} not found`);
        resolve();
        return;
      }
      this.character.setVisible(true);
      this.character.play(animationName);

      const anim = scene.anims.get(animationName);
      if (
        anim &&
        (anim.repeat === -1 || (anim as any).repeat === Number.POSITIVE_INFINITY) &&
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

  // move action status
  private currentMoveTween?: Phaser.Tweens.Tween;

  // moving
  public moveDirection(
    direction: Direction,
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
