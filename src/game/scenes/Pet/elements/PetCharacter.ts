import Phaser from "phaser";

// components
import { Character } from "@/game/components/Character";

// utils
import { selectFromPriority } from "@/game/utils/selectFromPriority";
import { ConfigManager } from "@/game/managers/ConfigManagers";
import { store, Store } from "@/game/store";
import { getValueFromColonStoreState } from "@/game/store/helper";
import { GAME_CONFIG } from "@/game/config";
import {
  ActionConfig,
  IdleActionConfig,
  PetState,
  TDirection,
} from "../types";

export class PetCharacter extends Character {
  private petState: PetState = PetState.IDLE;
  private isStarted: boolean = false;

  private idleActions: Record<string, IdleActionConfig>;
  private spaceEdge: { from: number; to: number };
  private direction: TDirection = "left";
  private isInterrupted: boolean = false;
  private watchState?: Store<number>;
  private config: any;

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

    this.config = config;
    this.character.setDepth(2);

    // actions
    this.idleActions = this.config.idleActions;
    this.activities = this.config.activities;

    // define moving limitation
    this.spaceEdge = GAME_CONFIG.PET.DEFAULT_POSITION.edge;

    // Listen to store if config has watch field
    if (this.config.watch) {
      this.watchState = store<number>(`${ipId}.${this.config.watch}`);
      this.watchState?.watch((val) => this.handleCharacterByWatchedState(val));
      this.handleCharacterByWatchedState(this.watchState?.get() || 0);
    }

    // default animation
    this.handleAutomaticAction();
  }

  private async handleCharacterByWatchedState(value: number) {
    if (!this.config || !this.config.list) return;

    const { list } = this.config;
    // 尋找對應 value 的設定，如果沒有，退而求其次找最後一個或是 default
    const current = list.find((item: any) => item.value === value) || list[list.length - 1];
    if (!current) return;

    const { key, configFile } = current;
    
    if (configFile) {
      
      // 動態載入角色的專屬設定檔
      if (!this.scene.cache.json.exists(configFile)) {
        await new Promise<void>((resolve) => {
          this.scene.load.json(configFile, `assets/${configFile}`);
          this.scene.load.once(`filecomplete-json-${configFile}`, () => {
            resolve();
          });
          this.scene.load.start();
        });
      }

      const characterData = this.scene.cache.json.get(configFile);
      if (characterData) {
        // 更新動作與行為綁定
        if (characterData.idleActions) this.idleActions = characterData.idleActions;
        if (characterData.activities) this.activities = characterData.activities;
        
        // 切換資源外觀與動畫
        if (key) {
          this.changeTextureKey(key, characterData.animations);
        }
        
        // 重新讀取配置到實體內
        ConfigManager.getInstance().get(`${ConfigManager.getInstance().getIpId()}.${GAME_CONFIG.PET.DEFAULT_CHARACTER_KEY}`).activities = this.activities;
        ConfigManager.getInstance().get(`${ConfigManager.getInstance().getIpId()}.${GAME_CONFIG.PET.DEFAULT_CHARACTER_KEY}`).idleActions = this.idleActions;


        // Let it switch state nicely when the skin changes
        if (this.isStarted) {
          this.interrupt();
        } else {
          // If the game hasn't "started" in the context of actions (but might physically exist), trigger start
          this.isStarted = true;
          this.handleDefaultIdleAction();
        }
      }
    } else if (key) {
      // 兼容舊格式直接換 key
      this.changeTextureKey(key, this.config.animations);
      if (this.isStarted) {
        this.interrupt();
      } else {
        this.isStarted = true;
        this.handleDefaultIdleAction();
      }
    }
  };

  private handleDefaultIdleAction() {
    if (this.petState !== PetState.IDLE) return;
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
    if (this.petState !== PetState.IDLE) return;
    if (!this.idleActions || Object.keys(this.idleActions).length === 0) return;

    // Idle
    const currentAction =
      selectFromPriority<IdleActionConfig>(this.idleActions);
    
    if (!currentAction) return;

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
      this.petState = PetState.ACTING;
      await this.playAnimationSet(currentAnimation);
      if (this.isInterrupted) return;
      this.petState = PetState.IDLE;
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
      this.petState = PetState.IDLE;
      this.handleDefaultIdleAction();
    } else {
      this.petState = PetState.MOVING;
      // Note: Character.ts defines TDirection locally, which is compatible with our TDirection
      this.moveDirection(
        this.direction as any,
        GAME_CONFIG.PET.MOVE_DISTANCE,
        () => {
          if (this.isInterrupted) return;
          this.petState = PetState.IDLE;
          this.handleDefaultIdleAction();
        },
      );
    }
  }

  private autoActionTimer?: Phaser.Time.TimerEvent;

  public startPet() {
    this.isStarted = true;
    this.handleDefaultIdleAction();
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
    if (this.petState !== PetState.IDLE) return;

    const ipId = ConfigManager.getInstance().getIpId();
    const actions = ConfigManager.getInstance().get(
      `${ipId}.mycharacter.actions`,
    ) as Record<string, ActionConfig>;
    
    const autoActions = ConfigManager.getInstance().get(
      `${ipId}.mycharacter.autoActions`,
    ) as Record<string, ActionConfig>;

    const action = actions?.[actionKey] || autoActions?.[actionKey];
    if (!action) return;

    const { animationSet } = action;

    const currentAnimationSet = getValueFromColonStoreState(animationSet);

    this.petState = PetState.ACTING;
    await this.playAnimationSet(currentAnimationSet);
    if (this.isInterrupted) return;
    this.petState = PetState.IDLE;
    this.handleDefaultIdleAction();
  }

  private async playAnimationSet(
    animationSet: string | string[],
    _canInterrupt = false,
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
          if (this.petState === PetState.IDLE) {
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
    this.petState = PetState.IDLE;
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
    if (this.watchState) {
      this.watchState.unwatchAll();
    }
    super.destroy();
  }
}
