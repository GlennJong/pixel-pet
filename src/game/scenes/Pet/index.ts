import { Scene } from "phaser";

import {
  sceneConverter,
  sceneStarter,
} from "@/game/components/SceneTransition";
import { initRuntimeData, setRuntimeData } from "@/game/runtimeData";
import { KnownRuntimeDataKey } from "@/game/runtimeData/types";
import { getStaticData } from "@/game/staticData";

import { HomeScreen } from "./screens/HomeScreen";
import {
  ActionRunner,
  AutoActionSystem,
  ConditionSystem,
  StatSystem,
  TaskQueue,
} from "./systems";
import { Task } from "./types";
import { StatItem } from "./types/common";
import { PetStats } from "./types/runtime";
import {
  getPetRuntimeDataKey,
  PET_STATIC_KEYS,
  PET_TASK_QUEUE_INTERVAL,
} from "./constants";
import { getCharacterActionsConfig } from "./utils/resolveActions";

/**
 * PetScene – the pet game.
 *
 * Layered like the editor:
 *
 *   this scene  – sets up the runtime data, builds the systems and the screen,
 *                 and connects the two. No rules and no drawing of its own.
 *   systems/    – the game's rules (stats, condition, auto actions, the task
 *                 queue, running one action)
 *   screens/    – what is on screen and the input on it (HomeScreen)
 *   elements/   – the parts the screen is made of
 *
 * A pick travels: HomeScreen 'select' → here, resolved into a task → TaskQueue
 * → ActionRunner, which plays it on the HomeScreen.
 *
 * Scene key: 'Pet'
 */
export default class PetScene extends Scene {
  private screen?: HomeScreen;

  private stats?: StatSystem;
  private condition?: ConditionSystem;
  private taskQueue?: TaskQueue;
  private autoActions?: AutoActionSystem;
  private runner?: ActionRunner;

  private isPetReady: boolean = false;

  constructor() {
    super("Pet");
  }

  create() {
    this.initDomainData();

    setRuntimeData("global.is_paused", true);

    this.screen = new HomeScreen(this);
    this.initSystems(this.screen);
    this.screen.on("select", this.handleSelect);
    this.screen.on("open-editor", this.handleOpenEditor);

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

  private initSystems(screen: HomeScreen) {
    this.stats = new StatSystem(this);
    this.condition = new ConditionSystem();

    this.runner = new ActionRunner({
      stage: screen,
      condition: this.condition,
      stats: this.stats,
      onMove: (target, params) => {
        setRuntimeData("global.transmit", params);
        sceneConverter(this, target);
      },
    });

    this.taskQueue = new TaskQueue(this);
    this.taskQueue.init({
      onTask: (task) => this.handleActionQueueTask(task),
      interval: PET_TASK_QUEUE_INTERVAL,
    });

    this.autoActions = new AutoActionSystem();
    this.autoActions.init({
      onTrigger: (action) =>
        this.handleAddEmergencyTask({
          ...action,
          action: action.action,
          user: action.user || "system",
        }),
    });
  }

  private async startScene() {
    await sceneStarter(this);
    this.screen?.start();
    this.isPetReady = true;
    setRuntimeData("global.is_paused", false);
  }

  private handleSelect = (actionName: string) => {
    const task = this.resolveActionTask(actionName);
    if (task) {
      this.taskQueue?.addTask(task);
    }
  };

  private handleOpenEditor = () => {
    this.scene.start("Editor", {
      returnSceneKey: "Pet",
      targetAtlasId: this.screen?.atlasId,
    });
  };

  private resolveActionTask(actionName: string): Task | null {
    const actionsConfig = getCharacterActionsConfig();

    const action = actionsConfig[actionName];
    return action
      ? { ...action, action: actionName, user: action.user || "system" }
      : null;
  }

  async handleActionQueueTask(queued: Task) {
    if (!this.isPetReady || !this.runner) return false;
    return this.runner.run(queued);
  }

  handleAddEmergencyTask(task: Task) {
    this.taskQueue?.clearQueue();
    this.screen?.interrupt();
    this.taskQueue?.addEmergentTask(task);
  }

  async handleUpgrade(
    taskQueue: TaskQueue,
    params: Record<string, string | number>,
  ) {
    if (!this.isPetReady) return false;
    taskQueue?.addTask({ action: "buy", user: "system", params });
    return true;
  }

  update() {
    this.screen?.update();
  }

  shutdown = () => {
    this.isPetReady = false;

    this.screen?.destroy();

    this.autoActions?.destroy();
    this.taskQueue?.destroy();
    this.stats?.destroy();
  };
}
