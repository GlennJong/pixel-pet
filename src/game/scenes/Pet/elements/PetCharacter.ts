import Phaser from "phaser";

// components
import { Character } from "@/game/components/Character";

// utils
import { selectFromPriority } from "@/game/utils/selectFromPriority";
import { ConfigManager } from "@/game/managers/ConfigManagers";
import { getValueFromColonStoreState } from "@/game/store/helper";
import { GAME_CONFIG } from "@/game/config";

type TDirection = "none" | "left" | "right";

type TAction = {
  animation: string;
  isMoving?: boolean;
  has_direction?: boolean;
};

type TIdleActions = {
  priority: number;
} & TAction;

export class PetCharacter extends Character {
  private isActing: boolean = false;
  private isReady: boolean = false;

  private idleActions: { [key: string]: TIdleActions };
  private spaceEdge: { from: number; to: number };
  private direction: TDirection = "left";

  public activities: { [key: string]: TAction };

  constructor(scene: Phaser.Scene) {
    const config = ConfigManager.getInstance().get(
      `pet.${GAME_CONFIG.PET.DEFAULT_CHARACTER_KEY}`,
    );

    super(scene, GAME_CONFIG.PET.DEFAULT_CHARACTER_KEY, {
      ...GAME_CONFIG.PET.DEFAULT_POSITION,
      animations: config.animations,
    });

    this.character.setDepth(2);

    // actions
    this.idleActions = config.idleActions;
    this.activities = config.activities;

    // define moving limitation
    this.spaceEdge = GAME_CONFIG.PET.DEFAULT_POSITION.edge;

    // default animation
    this.handleAutomaticAction();
  }

  private handleDefaultIdleAction() {
    if (this.isActing) return;
    this.playAnimation(`${GAME_CONFIG.PET.IDLE_PREFIX}-${this.direction}`);
  }

  private async handleAutomaticAction() {
    if (this.isActing) return;

    // Idle
    const currentAction = selectFromPriority<TIdleActions>(this.idleActions);
    const currentAnimation = getValueFromColonStoreState(
      currentAction.animationSet,
    );

    this.direction = currentAction.direction;

    let isMoving = false;
    if (typeof currentAction.isMoving !== "undefined") {
      isMoving = getValueFromColonStoreState(currentAction.isMoving);
    }

    if (isMoving) {
      this.handleMoveDirection(currentAnimation);
    } else {
      this.playAnimationSet(currentAnimation, true);
      this.handleDefaultIdleAction();
    }
  }

  public handleMoveDirection(animation: string) {
    this.isActing = true;
    this.playAnimationSet(animation);

    let isMovingDistanceOverEdge = false;
    if (this.direction === "right") {
      isMovingDistanceOverEdge =
        this.character.x + GAME_CONFIG.PET.MOVE_DISTANCE > this.spaceEdge.to;
    } else if (this.direction === "left") {
      isMovingDistanceOverEdge =
        this.character.x - GAME_CONFIG.PET.MOVE_DISTANCE < this.spaceEdge.from;
    }

    if (isMovingDistanceOverEdge) {
      this.isActing = false;
      this.handleDefaultIdleAction();
    } else {
      this.moveDirection(this.direction, GAME_CONFIG.PET.MOVE_DISTANCE, () => {
        this.isActing = false;
        this.handleDefaultIdleAction();
      });
    }
  }

  private autoActionTimer?: Phaser.Time.TimerEvent;

  public startPet() {
    this.isReady = true;
    if (!this.autoActionTimer) {
      this.autoActionTimer = this.scene.time.addEvent({
        delay: GAME_CONFIG.PET.AUTO_ACTION_DURATION,
        loop: true,
        callback: () => this.handleAutomaticAction(),
      });
    }
  }
  public stopPet() {
    this.isReady = false;
    if (this.autoActionTimer) {
      this.autoActionTimer.remove();
      this.autoActionTimer = undefined;
    }
  }

  public runFuntionalAction(action: string) {
    if (this.isActing) return;

    const actions = ConfigManager.getInstance().get("pet.mycharacter.actions");

    const { animationSet } = actions[action];

    const currentAnimationSet = getValueFromColonStoreState(animationSet);

    this.playAnimationSet(currentAnimationSet);
  }

  private playAnimationSet(animationSet, canInterrupt = false) {
    const runAnimation = async (func: () => Promise<void>) => {
      if (!canInterrupt) this.isActing = true;
      await func();
      if (!canInterrupt) this.isActing = false;
    };

    runAnimation(async () => {
      for (let i = 0; i < animationSet.length; i++) {
        await this.playAnimation(animationSet[i]);
      }
    });
  }

  public async runFuntionalActionAsync(action: string) {
    await new Promise<void>((resolve) => {
      const timer = this.scene.time.addEvent({
        delay: 50,
        loop: true,
        callback: () => {
          if (!this.isActing) {
            timer.remove();
            resolve();
          }
        },
      });
    });
    this.runFuntionalAction(action);
  }

  public update() {
    if (!this.isReady) return;
    if (this.isActing) this.updatePosition();
  }

  public destroy() {
    if (this.autoActionTimer) {
      this.autoActionTimer.remove();
      this.autoActionTimer = undefined;
    }
    super.destroy();
  }
}
