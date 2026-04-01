import { Scene } from "phaser";

// common components
import {
  sceneConverter,
  sceneStarter,
} from "@/game/components/CircleSceneTransition";
import { setRuntimeData, getRuntimeDataGroup } from "@/game/runtimeData";
import { EventBus } from "@/game/EventBus";

// partial elements
import { Header } from "./elements/Header";
import { PetCharacter } from "./elements/PetCharacter";
import { PetDialogue } from "./elements/PetDialogue";
import { Room } from "./elements/Room";

// services
import { TaskQueueService } from "./services/TaskQueueService";
import { Task } from "./services/types";

// handlers
import { KeyboardHandler } from "./handlers/KeyboardHander";
import { ConditionHandler } from "./handlers/ConditionHandler";
import { AutoActionHandler } from "./handlers/AutoActionHandler";
import { StatsHandler } from "./handlers/StatHandler";

// config
import { getStaticData } from "@/game/staticData";
import { GAME_CONFIG } from "@/game/constants";
import { StatItem } from "./types/common";
import { initRuntimeData } from "@/game/runtimeData";

export default class PetScene extends Scene {
  private header?: Header;
  private room?: Room;
  private character?: PetCharacter;
  private dialogue?: PetDialogue;
  
  private stats?: StatsHandler;
  private keyboardHandler?: KeyboardHandler;
  private taskQueueService?: TaskQueueService;
  private conditionHandler?: ConditionHandler;
  private autoActionHandler?: AutoActionHandler;

  private isPetReady: boolean = false;

  constructor() {
    super("Pet");
  }

  create() {
    this.initDomainData();
    
    setRuntimeData("global.is_paused", true);

    this.initViews();
    this.initSystems();
    this.initControls();
    
    this.startScene();

    this.events.on("shutdown", this.shutdown, this);
  }

  private initDomainData() {
    const stats = getStaticData<StatItem[]>(`pet.stats`) || [];

    const defaultStats: Record<string, number | string | any[]> = {
      hp: GAME_CONFIG.PET.DEFAULT_HP,
      coin: GAME_CONFIG.PET.DEFAULT_COIN,
      level: GAME_CONFIG.PET.DEFAULT_LEVEL,
      condition: "normal",
      taskQueue: [],
    };

    stats.forEach(({ key, value }: { key: string; value: any }) => {
      defaultStats[key] = value || 0;
    });

    for (const [key, value] of Object.entries(defaultStats)) {
      initRuntimeData(`pet.${key}` as any, value);
    }
  }

  private initViews() {
    this.character = new PetCharacter(this);
    this.room = new Room(this);
    this.room.init();
    this.header = new Header(this);
    this.dialogue = new PetDialogue(this);
  }

  private initSystems() {
    this.stats = new StatsHandler(this);
    this.conditionHandler = new ConditionHandler();

    this.taskQueueService = new TaskQueueService(this);
    this.taskQueueService.init({
      onTask: (task) => this.handleActionQueueTask(task),
      interval: 300,
    });

    this.autoActionHandler = new AutoActionHandler();
    this.autoActionHandler.init({
      onTrigger: (action) => this.handleAddEmergencyTask(action),
    });
  }

  private initControls() {
    this.keyboardHandler = new KeyboardHandler(this, {
      onLeft: () => this.handleControlButton("left"),
      onRight: () => this.handleControlButton("right"),
      onSpace: () => this.handleControlButton("space"),
    });

    EventBus.on("game-left-keydown", () => this.handleControlButton("left"));
    EventBus.on("game-right-keydown", () => this.handleControlButton("right"));
    EventBus.on("game-select-keydown", () => this.handleControlButton("space"));
  }

  private async startScene() {
    await sceneStarter(this);
    this.character?.startPet();
    this.isPetReady = true;
    setRuntimeData("global.is_paused", false);
  }

  private handleControlButton = (key: string) => {
    if (key === "left") {
      this.header!.movePrev();
    } else if (key === "right") {
      this.header!.moveNext();
    } else if (key === "space") {
      const action = this.header!.select();
      const task = this.resolveActionTask(action);
      if (task) {
        this.taskQueueService?.addTask(task);
      }
    }
  };

  private resolveActionTask(actionName: string): Task | null {
    const characterConfig = getStaticData(`pet.mycharacter`);
    let actionsConfig: Record<string, any> = {};
    
    if (characterConfig.watch && characterConfig.stages) {
      const level = getRuntimeDataGroup(`pet.${characterConfig.watch}`) || 0;
      const current = characterConfig.stages.find((l: any) => l.value === level) || characterConfig.stages[0];
      actionsConfig = current.actions || {};
    } else {
      actionsConfig = characterConfig.actions || {};
    }

    return actionsConfig[actionName] || null;
  }

  async handleActionQueueTask(task: Task) {
    if (!this.isPetReady) return false;
    let success = false;
    const { action, user, params, effect, dialogues, move } = task;
    try {
      await this.character?.runFunctionalActionAsync(action);
      this.conditionHandler?.runEffect(effect);
      this.stats?.runEffect(effect);

      if (this.dialogue && dialogues) {
        let effectReplacement: Record<string, any> = {};
        if (effect) {
          effectReplacement = Object.fromEntries(
            Object.entries(effect).map(([key, obj]) => [
              key,
              (obj as { value: any }).value,
            ]),
          );
        }
        const replacement = { user, ...effectReplacement, ...params };
        await this.dialogue.runDialogue(dialogues, replacement);
      }

      if (move) {
        setRuntimeData("global.transmit", params);
        sceneConverter(this, move);
      }

      success = true;
    } catch (err) {
      console.error("handleActionQueueTask error:", err);
      success = false;
    }
    return success;
  }

  handleAddEmergencyTask(task: Task) {
    this.taskQueueService?.clearQueue();
    this.character?.interrupt();
    this.taskQueueService?.addEmergentTask(task);
  }

  async handleUpgrade(taskQueueService: any, params: any) {
    if (!this.isPetReady) return false;
    taskQueueService?.addTask({ action: "buy", user: "system", params });
    return true;
  }

  update() {
    this.character?.update();
    this.header!.update();
    this.keyboardHandler!.update();
  }

  shutdown = () => {
    this.isPetReady = false;

    this.character?.destroy();
    this.header?.destroy();
    this.room?.destroy();
    this.dialogue?.destroy();
    
    this.autoActionHandler?.destroy();
    this.taskQueueService?.destroy();
    this.stats?.destroy();

    EventBus.off("game-left-keydown");
    EventBus.off("game-right-keydown");
    EventBus.off("game-select-keydown");
  };
}
