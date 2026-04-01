import Phaser from "phaser";

// components
import { Character } from "@/game/components/Character";

// utils
import { selectFromPriority } from "@/game/utils/selectFromPriority";
import { getStaticData } from "@/game/staticData";
import { getValueFromColonRuntimeData } from "@/game/runtimeData/helper";
import { runtimeData, ObservableValue } from "@/game/runtimeData";
import { GAME_CONFIG } from "@/game/constants";
import {
  ActionDef,
  IdleActionDef,
  PetState,
  TDirection,
  CharacterConfig,
  CharacterStageItem,
} from "../types";

export class PetCharacter extends Character {
  private _state: PetState = PetState.IDLE;
  private isStarted: boolean = false;

  private idleActions: Record<string, IdleActionDef>;
  private spaceEdge: { from: number; to: number };
  private direction: TDirection = "left";
  private isInterrupted: boolean = false;
  private watchState?: ObservableValue<number>;

  public activities: Record<string, ActionDef>;

  constructor(scene: Phaser.Scene) {
    
    const config = getStaticData<CharacterConfig>(
      `pet.${GAME_CONFIG.PET.DEFAULT_CHARACTER_KEY}`,
    );

    let initialAnimations = (config as any).animations || [];
    if (config.watch && config.stages && config.stages.length > 0) {
      const level = runtimeData(`pet.${config.watch}` as any)?.get() || 0;
      const initialConfig = config.stages.find((l) => l.value === level) || config.stages[0];
      if (initialConfig.animations) initialAnimations = initialConfig.animations;
    }

    super(scene, GAME_CONFIG.PET.DEFAULT_CHARACTER_KEY, {
      ...GAME_CONFIG.PET.DEFAULT_POSITION,
      animations: initialAnimations,
    });

    this.character.setDepth(2);

    // Initial setup (may be instantly overridden by handleCharacterUpgrade)
    this.idleActions = (config as any).idleActions || {};
    this.activities = (config as any).activities || {};

    // define moving limitation
    this.spaceEdge = GAME_CONFIG.PET.DEFAULT_POSITION.edge;

    // setup watcher for level or other state based on config (like room.json)
    if (config.watch && config.stages) {
      this.watchState = runtimeData(`pet.${config.watch}` as any);
      this.watchState?.watch((value: number) => {
        this.handleCharacterUpgrade(value, config.stages);
      });
      this.handleCharacterUpgrade(this.watchState?.get() || 0, config.stages);
    } else {
      // default animation
      this.handleAutomaticAction();
    }
  }

  private handleCharacterUpgrade(value: number, list: CharacterStageItem[]) {
    const current = list.find((item) => item.value === value) || list[0];
    if (!current) return;
    
    // Register new animations if provided
    if (current.animations) {
      current.animations.forEach((animConfig) => {
        const animationName = `${GAME_CONFIG.PET.DEFAULT_CHARACTER_KEY}_${animConfig.prefix}`;
        if (this.scene.anims.exists(animationName)) return; // prevent recreate

        const data: Phaser.Types.Animations.Animation = {
          key: animationName,
          frames: this.scene.anims.generateFrameNames(GAME_CONFIG.PET.DEFAULT_CHARACTER_KEY, {
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

    this.idleActions = current.idleActions;
    this.activities = current.actions;

    // Restart actions to apply new config
    this.interrupt();
    this.handleDefaultIdleAction();
  }

  private handleDefaultIdleAction() {
    if (this._state !== PetState.IDLE) return;
    const defaultKey = `${GAME_CONFIG.PET.IDLE_PREFIX}-${this.direction}`;
    const actionConfig = this.idleActions[defaultKey];

    if (actionConfig) {
      const currentAnimation = getValueFromColonRuntimeData(
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
      selectFromPriority<IdleActionDef>(this.idleActions);
    const currentAnimation = getValueFromColonRuntimeData(
      currentAction.animationSet,
    );

    this.direction = currentAction.direction as TDirection;

    let isMoving = false;
    if (currentAction.isMoving) {
      isMoving = getValueFromColonRuntimeData(currentAction.isMoving);
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

    if (!this.activities) return;
    const action = this.activities[actionKey];
    if (!action) return;

    const { animationSet } = action;

    const currentAnimationSet = getValueFromColonRuntimeData(animationSet);

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
    if (this.watchState) {
      this.watchState.unwatchAll();
    }
    if (this.autoActionTimer) {
      this.autoActionTimer.remove();
      this.autoActionTimer = undefined;
    }
    super.destroy();
  }
}
