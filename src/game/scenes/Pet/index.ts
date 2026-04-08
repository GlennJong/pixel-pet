import { Scene } from "phaser";

// common components
import {
  sceneConverter,
  sceneStarter,
} from "@/game/components/SceneTransition";
import { setRuntimeData } from "@/game/runtimeData";
import { EventBus } from "@/game/EventBus";

// partial elements
import { Header } from "./elements/Header";
import { PetCharacter } from "./elements/PetCharacter";
import { PetDialogue } from "./elements/PetCharacter/PetDialogue";
import { Room } from "./elements/Room";

// services
import { TaskQueueService } from "./services/TaskQueueService";
import { ActionEffect, Task } from "./types";

// handlers
import { KeyboardHandler } from "./handlers/KeyboardHander";
import { ConditionHandler } from "./handlers/ConditionHandler";
import { AutoActionHandler } from "./handlers/AutoActionHandler";
import { StatsHandler } from "./handlers/StatHandler";

// config
import { getStaticData } from "@/game/staticData";
import {
  getPetRuntimeDataKey,
  PET_STATIC_KEYS,
  PET_TASK_QUEUE_INTERVAL,
} from "./constants";
import { StatItem } from "./types/common";
import { PetStats } from "./types/runtime";
import { initRuntimeData } from "@/game/runtimeData";
import { KnownRuntimeDataKey } from "@/game/runtimeData/types";
import { getCharacterActionsConfig } from "./utils/resolveActions";

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
    const stats = getStaticData<StatItem[]>(PET_STATIC_KEYS.STATS) || [];

    const defaultStats: Partial<PetStats> = {
      condition: "normal",
      taskQueue: [] as Task[],
    };

    stats.forEach(({ id, value }) => {
      if (id === "taskQueue") {
        defaultStats[id] = Array.isArray(value) ? value : [];
      } else {
        defaultStats[id] = value;
      }
    });

    // Init runtime data
    for (const [id, value] of Object.entries(defaultStats)) {
      initRuntimeData(getPetRuntimeDataKey(id) as KnownRuntimeDataKey, value as any);
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
      interval: PET_TASK_QUEUE_INTERVAL,
    });

    this.autoActionHandler = new AutoActionHandler();
    this.autoActionHandler.init({
      onTrigger: (action) =>
        this.handleAddEmergencyTask({
          ...action,
          action: action.action,
          user: action.user || "system",
        }),
    });
  }

  private handleLeftKeyDown = () => this.handleControlButton("left");
  private handleRightKeyDown = () => this.handleControlButton("right");
  private handleSelectKeyDown = () => this.handleControlButton("space");

  private initControls() {
    this.keyboardHandler = new KeyboardHandler(this, {
      onLeft: this.handleLeftKeyDown,
      onRight: this.handleRightKeyDown,
      onSpace: this.handleSelectKeyDown,
    });

    EventBus.on("game-left-keydown", this.handleLeftKeyDown);
    EventBus.on("game-right-keydown", this.handleRightKeyDown);
    EventBus.on("game-select-keydown", this.handleSelectKeyDown);
  }

  private async startScene() {
    await sceneStarter(this, { type: 'circle', delay: 2000 });
    this.character?.startPet();
    this.isPetReady = true;
    setRuntimeData("global.is_paused", false);
  }

  private handleControlButton = (key: string) => {
    if (key === "left") {
      this.header?.movePrev();
    } else if (key === "right") {
      this.header?.moveNext();
    } else if (key === "space") {
      const action = this.header?.select();
      const task = this.resolveActionTask(action);
      if (task) {
        this.taskQueueService?.addTask(task);
      }
    }
  };

  private resolveActionTask(actionName: string): Task | null {
    const actionsConfig = getCharacterActionsConfig();

    const action = actionsConfig[actionName];
    return action
      ? { ...action, action: actionName, user: action.user || "system" }
      : null;
  }

  async handleActionQueueTask(task: Task) {
    if (!this.isPetReady) return false;
    let success = false;
    const { action, user, params, dialogues, move } = task;

    let effect = task.effect;
    if (!effect) {
      const effectsConfig = getStaticData(PET_STATIC_KEYS.EFFECTS) || [];
      const effectEntry = effectsConfig.find((e: any) => e.action === action);
      if (effectEntry) {
        effect = effectEntry.effect;
      }
    }

    try {
      await this.character?.runFunctionalActionAsync(action);
      this.conditionHandler?.runEffect(effect || {});
      this.stats?.runEffect(effect || {});

      if (this.dialogue && dialogues) {
        let effectReplacement: Record<string, number | string> = {};
        if (effect) {
          effectReplacement = Object.fromEntries(
            Object.entries(effect).map(([key, obj]) => [
              key,
              (obj as ActionEffect).value,
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

  async handleUpgrade(
    taskQueueService: TaskQueueService,
    params: Record<string, string | number>,
  ) {
    if (!this.isPetReady) return false;
    taskQueueService?.addTask({ action: "buy", user: "system", params });
    return true;
  }

  update() {
    this.character?.update();
    this.header?.update();
    this.keyboardHandler?.update();
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
    this.keyboardHandler?.destroy();

    EventBus.off("game-left-keydown", this.handleLeftKeyDown);
    EventBus.off("game-right-keydown", this.handleRightKeyDown);
    EventBus.off("game-select-keydown", this.handleSelectKeyDown);
  };
}
