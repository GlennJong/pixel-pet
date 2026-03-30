import Phaser from "phaser";

// components
import { Character } from "@/game/components/Character";

// utils
import { selectFromPriority } from "@/game/utils/selectFromPriority";
import { ConfigManager } from "@/game/managers/ConfigManagers";
import { getValueFromColonStoreState } from "@/game/store/helper";
import { GAME_CONFIG } from "@/game/config";
import {
  ActionConfig,
  IdleActionConfig,
  PetState,
  TDirection,
} from "../types";

export class PetCharacter extends Character {
  private _state: PetState = PetState.IDLE;
  private isStarted: boolean = false;

  private idleActions: Record<string, IdleActionConfig>;
  private spaceEdge: { from: number; to: number };
  private direction: TDirection = "left";
  private isInterrupted: boolean = false;

  public activities: Record<string, ActionConfig>;

  constructor(scene: Phaser.Scene) {
    const ipId = ConfigManager.getInstance().getIpId();
    const config = ConfigManager.getInstance().get(
      `${ipId}.${GAME_CONFIG.PET.DEFAULT_CHARACTER_KEY}`,
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
    if (this._state !== PetState.IDLE) return;
    const defaultKey = `${GAME_CONFIG.PET.IDLE_PREFIX}-${this.direction}`;
    const actionConfig = this.idleActions[defaultKey];

    if (actionConfig) {
      const currentAnimation = getValueFromColonStoreState(
        actionConfig.animationSet,
      );
      const firstAnim = Array.isArray(currentAnimation)
        ? currentAnimation[0]
        : currentAnimation;
      this.playAnimation(firstAnim);
    } else {
      this.playAnimation(defaultKey);
    }
  }

  private async handleAutomaticAction() {
    if (this._state !== PetState.IDLE) return;

    // Idle
    const currentAction =
      selectFromPriority<IdleActionConfig>(this.idleActions);
    const currentAnimation = getValueFromColonStoreState(
      currentAction.animationSet,
    );

    this.direction = currentAction.direction as TDirection;

    let isMoving = false;
    if (currentAction.isMoving) {
      isMoving = getValueFromColonStoreState(currentAction.isMoving);
    }

    if (isMoving) {
      this.handleMoveDirection(currentAnimation);
    } else {
      this._state = PetState.ACTING;
      await this.playAnimationSet(currentAnimation);
      if (this.isInterrupted) return;
      this._state = PetState.IDLE;
      this.handleDefaultIdleAction();
    }
  }

  public handleMoveDirection(animation: string | string[]) {
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
      if (this.isInterrupted) return;
      this._state = PetState.IDLE;
      this.handleDefaultIdleAction();
    } else {
      this._state = PetState.MOVING;
      // Note: Character.ts defines TDirection locally, which is compatible with our TDirection
      this.moveDirection(
        this.direction as any,
        GAME_CONFIG.PET.MOVE_DISTANCE,
        () => {
          if (this.isInterrupted) return;
          this._state = PetState.IDLE;
          this.handleDefaultIdleAction();
        },
      );
    }
  }

  private autoActionTimer?: Phaser.Time.TimerEvent;

  public startPet() {
    this.isStarted = true;
    if (!this.autoActionTimer) {
      this.autoActionTimer = this.scene.time.addEvent({
        delay: GAME_CONFIG.PET.AUTO_ACTION_DURATION,
        loop: true,
        callback: () => this.handleAutomaticAction(),
      });
    }
  }
  public stopPet() {
    this.isStarted = false;
    if (this.autoActionTimer) {
      this.autoActionTimer.remove();
      this.autoActionTimer = undefined;
    }
  }

  public async runFunctionalAction(actionKey: string) {
    if (this._state !== PetState.IDLE) return;

    const ipId = ConfigManager.getInstance().getIpId();
    const actions = ConfigManager.getInstance().get(
      `${ipId}.mycharacter.actions`,
    ) as Record<string, ActionConfig>;

    const action = actions[actionKey];
    if (!action) return;

    const { animationSet } = action;

    const currentAnimationSet = getValueFromColonStoreState(animationSet);

    this._state = PetState.ACTING;
    await this.playAnimationSet(currentAnimationSet);
    if (this.isInterrupted) return;
    this._state = PetState.IDLE;
    this.handleDefaultIdleAction();
  }

  private async playAnimationSet(
    animationSet: string | string[],

  ) {
    this.isInterrupted = false;
    const animations = Array.isArray(animationSet)
      ? animationSet
      : [animationSet];

    for (const anim of animations) {
      if (this.isInterrupted) break;
      await this.playAnimation(anim);
    }
  }

  public async runFunctionalActionAsync(action: string) {
    await new Promise<void>((resolve) => {
      const timer = this.scene.time.addEvent({
        delay: 50,
        loop: true,
        callback: () => {
          if (this._state === PetState.IDLE) {
            timer.remove();
            resolve();
          }
        },
      });
    });
    this.runFunctionalAction(action);
  }

  public interrupt() {
    this.isInterrupted = true;
    this._state = PetState.IDLE;
    this.stopAllActions();
    
    // Reset auto action timer so it doesn't sneak in before emergent tasks start
    if (this.autoActionTimer && this.isStarted) {
      this.autoActionTimer.remove();
      this.autoActionTimer = this.scene.time.addEvent({
        delay: GAME_CONFIG.PET.AUTO_ACTION_DURATION,
        loop: true,
        callback: () => this.handleAutomaticAction(),
      });
    }
  }

  public update() {
    if (!this.isStarted) return;
    // Movement handled by Tweens in Character.ts, no need to call updatePosition
  }

  public destroy() {
    if (this.autoActionTimer) {
      this.autoActionTimer.remove();
      this.autoActionTimer = undefined;
    }
    super.destroy();
  }
}
