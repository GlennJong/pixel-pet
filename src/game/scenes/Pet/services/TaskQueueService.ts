import Phaser from "phaser";

import {
  runtimeData,
  setRuntimeData,
  getRuntimeDataGroup,
  ObservableValue,
} from "@/game/runtimeData";
import { filterFromMatchList } from "@/game/utils/filterFromMatchList";
import { ActionMap, CharacterStageItem } from "../elements/PetCharacter/types";
import { getPetRuntimeDataKey, PET_STATIC_KEYS } from "../constants";

import { Message, CommandMap, Task } from "../types";
import { MESSAGE_QUEUE_STORE_KEY } from "./constants";
import { getStaticData } from "@/game/staticData";

export class TaskQueueService {
  private taskQueueState?: ObservableValue<Task[]>;
  private messageQueueState = runtimeData(MESSAGE_QUEUE_STORE_KEY);
  private timerEvent?: Phaser.Time.TimerEvent;
  private interval?: number;
  private commandMapList: CommandMap[] = [];

  private onTask?: (task: Task) => boolean | Promise<boolean>;
  private scene: Phaser.Scene;

  private retryCounts: Map<string, number> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.taskQueueState = runtimeData("pet.taskQueue");
  }

  init({
    onTask,
    interval,
  }: {
    onTask?: (task: Task) => boolean | Promise<boolean>;
    interval?: number;
  }) {
    this.onTask = onTask;
    this.interval = interval || this.interval;

    const commandsConfig = getStaticData("commands");
    this.commandMapList = Object.values(commandsConfig || {});

    this.messageQueueState?.watch(this.handleMessageQueueChange);

    this.taskQueueState?.watch(this.handleTaskQueueChange);
  }

  private handleMessageQueueChange = (messages: Message[]) => {
    if (!messages.length) return;
    const tasks: Task[] = [];
    let updated = false;
    messages.forEach((msg) => {
      const result = filterFromMatchList(msg, this.commandMapList);
      const characterConfig = getStaticData(PET_STATIC_KEYS.CHARACTER);
      let actionsConfig: ActionMap = {};
      if (characterConfig.watch && characterConfig.stages) {
        const watchKey = getPetRuntimeDataKey(characterConfig.watch);
        const level = getRuntimeDataGroup(watchKey) || 0;
        const current =
          characterConfig.stages.find(
            (l: CharacterStageItem) => l.value === level,
          ) || characterConfig.stages[0];
        actionsConfig = { ...(characterConfig.actions || {}), ...(current?.actions || {}) };
      } else {
        actionsConfig = characterConfig.actions || {};
      }

      if (result) {
        console.log({ result });

        tasks.push({ ...actionsConfig[result.action], ...msg, ...result });
        updated = true;
      }
    });
    if (updated) {
      const currentTasks = this.taskQueueState?.get() || [];
      setRuntimeData("pet.taskQueue", [...currentTasks, ...tasks]);
      setRuntimeData(MESSAGE_QUEUE_STORE_KEY, []);
    }
  };

  private handleTaskQueueChange = (tasks: Task[]) => {
    if (!this.timerEvent && tasks.length > 0) {
      this.startNextTask();
    }
  };

  addTask(task: Task) {
    const queue = this.taskQueueState?.get() || [];
    setRuntimeData("pet.taskQueue", [...queue, task]);
  }

  addEmergentTask(task: Task) {
    const queue = this.taskQueueState?.get() || [];
    setRuntimeData("pet.taskQueue", [task, ...queue]);
  }

  removeTask(index: number) {
    const queue = this.taskQueueState?.get() || [];
    if (index < 0 || index >= queue.length) return;
    queue.splice(index, 1);
    setRuntimeData("pet.taskQueue", [...queue]);
  }

  clearQueue() {
    setRuntimeData("pet.taskQueue", []);
  }

  private async startNextTask() {
    const queue = this.taskQueueState?.get() || [];
    if (queue.length === 0) return;

    const task = queue[0];
    const taskId = JSON.stringify(task); // Use a unique identifier for the task
    const maxRetry = 3;

    const handleTask = async () => {
      let success = false;
      try {
        if (this.onTask && "action" in task) {
          success = await this.onTask(task as Task);
        }
      } catch (err) {
        console.error("TaskQueueService onTask error:", err);
        success = false;
      }
      if (success) {
        const currentQueue = this.taskQueueState?.get() || [];
        const index = currentQueue.indexOf(task);
        if (index !== -1) {
          this.removeTask(index);
        }
        this.retryCounts.delete(taskId);
      } else {
        const retryCount = (this.retryCounts.get(taskId) || 0) + 1;
        this.retryCounts.set(taskId, retryCount);
        if (retryCount > maxRetry) {
          console.warn(
            "TaskQueueService: task failed too many times, removing from queue.",
            task,
          );
          const currentQueue = this.taskQueueState?.get() || [];
          const index = currentQueue.indexOf(task);
          if (index !== -1) {
            this.removeTask(index);
          }
          this.retryCounts.delete(taskId);
        } else {
          console.warn("TaskQueueService: task failed, will retry.", task);
        }
      }
      this.timerEvent = undefined;
      this.startNextTask();
    };

    this.timerEvent = this.scene.time.addEvent({
      delay: this.interval,
      callback: () => {
        handleTask();
      },
      loop: false,
    });
  }

  destroy() {
    if (this.timerEvent) {
      this.timerEvent.remove();
      this.timerEvent = undefined;
    }
    this.onTask = undefined;
    this.messageQueueState?.unwatch(this.handleMessageQueueChange);
    this.taskQueueState?.unwatch(this.handleTaskQueueChange);
  }
}
