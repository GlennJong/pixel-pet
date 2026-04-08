import Phaser from "phaser";
import { AnimationItem } from "../scenes/Pet/types";

import { createAnimationsFromConfig } from "@/game/utils/animation";

export type CharacterDirection = "none" | "left" | "right" | "top" | "down";

export type CharacterProps = {
  x: number;
  y: number;
  animations: AnimationItem[];
  texture?: string;
};

export class Character extends Phaser.GameObjects.Container {
  public character: Phaser.GameObjects.Sprite;

  private followShadow?: Phaser.GameObjects.Arc;
  public atlasId: string;

  constructor(scene: Phaser.Scene, atlasId: string, props: CharacterProps) {
    super(scene);

    const { x, y, animations, texture } = props;

    // load animation by key
    this.atlasId = atlasId;

    if (animations) {
      createAnimationsFromConfig(scene, atlasId, animations, texture);
    }

    // create character
    const posX = x || 0;
    const posY = y || 0;
    const character = scene.add
      .sprite(posX, posY, texture || atlasId)
      .setScale(1)
      .setOrigin(0);

    this.character = character;
    scene.add.existing(this);
  }

  public playStatic(frame: string) {
    this.character.setTexture(this.atlasId, frame);
  }

  public setFollowShadow(shadow: Phaser.GameObjects.Arc) {
    this.followShadow = shadow;
  }

  private pendingResolves: Array<() => void> = [];
  private activeTimeouts: ReturnType<typeof setTimeout>[] = [];

  public async playAnimation(prefix: string, time?: number): Promise<void> {
    return new Promise((resolve) => {
      const animationName = `${this.atlasId}_${prefix}`;
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
            const timeoutId = setTimeout(() => {
              this.pendingResolves = this.pendingResolves.filter(
                (r) => r !== resolve,
              );
              this.activeTimeouts = this.activeTimeouts.filter(
                (t) => t !== timeoutId,
              );
              resolve();
            }, time);
            this.activeTimeouts.push(timeoutId);
          } else {
            this.pendingResolves = this.pendingResolves.filter(
              (r) => r !== resolve,
            );
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

    // Clear all pending timeouts to prevent memory leaks and dangling resolves
    this.activeTimeouts.forEach(clearTimeout);
    this.activeTimeouts = [];

    if (this.currentMoveTween?.isPlaying()) {
      this.currentMoveTween.stop();
      this.currentMoveTween = undefined;
    }
  }

  public updatePosition(): void {
    // Deprecated: Movement handled by Tweens
  }

  public destroy() {
    this.activeTimeouts.forEach(clearTimeout);
    this.activeTimeouts = [];
    this.character.destroy();
  }
}
