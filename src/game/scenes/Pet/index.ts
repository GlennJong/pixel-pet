import { Scene } from "phaser";

// common components
import {
  sceneConverter,
  sceneStarter,
} from "@/game/components/CircleSceneTransition";
import { setStoreState, getStoreState } from "@/game/store";
import { EventBus } from "@/game/EventBus";

// partial elements
import { Header } from "./elements/Header";
import { PetCharacter } from "./elements/PetCharacter";
import { PetDialogue } from "./elements/PetDialogue";

// services
import { TaskQueueService } from "./services/TaskQueueService";

// handlers
import { KeyboardHandler } from "./handlers/KeyboardHander";
import { Task } from "./services/types";
import { ConfigManager } from "@/game/managers/ConfigManagers";
import { ConditionHandler } from "./handlers/ConditionHandler";
import { AutoActionHandler } from "./handlers/AutoActionHandler";
import { StatsHandler } from "./handlers/StatHandler";
import { Room } from "./elements/Room";

export default class PetScene extends Scene {
  private header?: Header;
  private room?: Room;
  private character?: PetCharacter;
  private stats?: StatsHandler;
  private dialogue?: PetDialogue;
  private keyboardHandler?: KeyboardHandler;

  private taskQueueService?: TaskQueueService;
  // private coinHandler?: CoinHandler;
  // private statHandlerGroup: StatHandler[] = [];
  private conditionHandler?: ConditionHandler;
  private autoActionHandler?: AutoActionHandler;

  private isPetReady: boolean = false;

  constructor() {
    super("Pet");
  }
  create() {
    // ============= Mechanism =============
    setStoreState("global.is_paused", true);

    // charactor
    this.character = new PetCharacter(this);

    // room
    this.room = new Room(this);
    this.room.init();

    // header
    this.header = new Header(this);

    // dialogue
    this.dialogue = new PetDialogue(this);

    // Stats Handler
    this.stats = new StatsHandler(this);

    // Condition handler
    this.conditionHandler = new ConditionHandler();

    // queue init
    this.taskQueueService = new TaskQueueService(this);
    this.taskQueueService.init({
      onTask: (task) => this.handleActionQueueTask(task),
      interval: 300,
    });

    this.autoActionHandler = new AutoActionHandler();
    this.autoActionHandler.init({
      onTrigger: (action) => this.handleAddEmergencyTask(action),
    });

    // Build Keyboard
    this.keyboardHandler = new KeyboardHandler(this, {
      onLeft: () => this.handleControlButton("left"),
      onRight: () => this.handleControlButton("right"),
      onSpace: () => this.handleControlButton("space"),
    });

    EventBus.on("game-left-keydown", () => {
      this.handleControlButton("left");
    }),
      EventBus.on("game-right-keydown", () =>
        this.handleControlButton("right"),
      ),
      EventBus.on("game-select-keydown", () =>
        this.handleControlButton("space"),
      ),
      // Run opening scene and start pet
      (async () => {
        await sceneStarter(this);
        this.character?.startPet();
        this.isPetReady = true;
        setStoreState("global.is_paused", false);
      })();

    this.events.on("shutdown", this.shutdown, this);
  }

  private handleControlButton = (key: string) => {
    if (key === "left") {
      this.header!.movePrev();
    } else if (key === "right") {
      this.header!.moveNext();
    } else if (key === "space") {
      const action = this.header!.select();

      const ipId = ConfigManager.getInstance().getIpId();
      const characterConfig = ConfigManager.getInstance().get(`${ipId}.mycharacter`);
      
      let actionsConfig: Record<string, any> = {};
      if (characterConfig.watch && characterConfig.stages) {
        const level = getStoreState(`${ipId}.${characterConfig.watch}`) || 0;
        const current = characterConfig.stages.find((l: any) => l.value === level) || characterConfig.stages[0];
        actionsConfig = current.actions || {};
      } else {
        actionsConfig = characterConfig.actions || {};
      }

      const task = actionsConfig[action];
      if (task) {
        this.taskQueueService?.addTask(task);
      }
    }
  };

  async handleActionQueueTask(task: Task) {
    if (!this.isPetReady) return false;
    let success = false;
    const { action, user, params, effect, dialogues, move } = task;
    try {
      await this.character?.runFunctionalActionAsync(action);
      this.conditionHandler?.runEffect(effect);

      // Run Dialogue
      if (this.dialogue) {
        let effectReplacement = {};

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

      this.stats?.runEffect(effect);

      if (move) {
        setStoreState("global.transmit", params);
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
    this.taskQueueService?.clearQueue(); // Flush any pending normal actions so emergent task runs alone
    this.character?.interrupt(); // Force character to stop current action and return to IDLE immediately
    this.taskQueueService?.addEmergentTask(task); // Add task to the front of queue immediately
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
