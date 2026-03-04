import Phaser from "phaser";

type TDirection = "none" | "left" | "right" | "top" | "down";

type TAnimation = {
  prefix: string;
  qty: number;
  freq: number;
  repeat: number;
  duration: number;
  repeat_delay: number;
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
      animations.forEach((_ani) => {
        const animationName = `${key}_${_ani.prefix}`;
        if (scene.anims.exists(animationName)) return; // prevent recreate after change scene.

        const data: Phaser.Types.Animations.Animation = {
          key: animationName,
          frames: scene.anims.generateFrameNames(key, {
            prefix: `${_ani.prefix}_`,
            start: 1,
            end: _ani.qty,
          }),
          repeat: _ani.repeat,
        };

        if (typeof _ani.freq !== "undefined") data.frameRate = _ani.freq;
        if (typeof _ani.duration !== "undefined") data.duration = _ani.duration;
        if (typeof _ani.repeat_delay !== "undefined")
          data.repeatDelay = _ani.repeat_delay;

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
      this.character.on(
        "animationcomplete",
        (e: Phaser.Animations.Animation) => {
          if (e.key === animationName) {
            if (typeof time !== "undefined") {
              setTimeout(() => resolve(), time);
            } else {
              resolve();
            }
            this.character.off("animationcomplete");
          }
        },
      );
    });
  }

  // move action status
  private currentMoveAction?: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    callback: () => void;
  };
  private currentMovingFrame = { total: 60, count: 0 };

  // moving
  public moveDirection(
    direction: TDirection,
    distance: number,
    callbackFunc: () => void,
  ) {
    if (!this.currentMoveAction) {
      let x = this.character.x,
        y = this.character.y;

      if (direction === "left") {
        x -= distance;
      } else if (direction === "right") {
        x += distance;
      } else if (direction === "top") {
        y -= distance;
      } else if (direction === "down") {
        y += distance;
      }

      this.currentMoveAction = {
        from: { x: this.character.x, y: this.character.y },
        to: { x, y },
        callback: callbackFunc,
      };
    }
  }

  public updatePosition(): void {
    if (this.currentMoveAction) {
      // Start count the frames
      this.currentMovingFrame.count += 1;

      // movement
      const { from, to } = this.currentMoveAction;
      const { total, count } = this.currentMovingFrame;

      this.character.setPosition(
        from.x + ((to.x - from.x) * count) / total,
        from.y + ((to.y - from.y) * count) / total,
      );

      if (this.followShadow) {
        this.followShadow.setPosition(
          from.x + ((to.x - from.x) * count) / total,
          from.y + ((to.y - from.y) * count) / total,
        );
      }

      if (total == count) {
        this.character.setPosition(to.x, to.y);

        // reset after moved
        this.currentMoveAction.callback();
        this.currentMoveAction = undefined;
        this.currentMovingFrame.count = 0;
      }
    }
  }

  public destroy() {
    this.character.destroy();
  }
}
