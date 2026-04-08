import Phaser from "phaser";

import {
  runtimeData,
  setRuntimeData,
  ObservableValue,
} from "@/game/runtimeData";
import { filterFromMatchList } from "@/game/utils/filterFromMatchList";

import { Message, CommandMap, Task } from "../types";
import { MESSAGE_QUEUE_STORE_KEY } from "./constants";
import { getStaticData } from "@/game/staticData";
import { getCharacterActionsConfig } from "../utils/resolveActions";

// Generate a unique fallback ID for tasks
const generateTaskId = () => Date.now().toString(36) + Math.random().toString(36).substring(2);

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

    const actionsConfig = getCharacterActionsConfig();

    messages.forEach((msg) => {
      const result = filterFromMatchList(msg, this.commandMapList);
      
      if (result) {
        console.log({ result });

        tasks.push({ 
          id: generateTaskId(), 
          ...actionsConfig[result.action], 
          ...msg, 
          ...result 
        });
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
    setRuntimeData("pet.taskQueue", [...queue, { ...task, id: task.id || generateTaskId() }]);
  }

  addEmergentTask(task: Task) {
    const queue = this.taskQueueState?.get() || [];
    setRuntimeData("pet.taskQueue", [{ ...task, id: task.id || generateTaskId() }, ...queue]);
  }

  removeTask(index: number) {
    const queue = this.taskQueueState?.get() || [];
    if (index < 0 || index >= queue.length) return;
    queue.splice(index, 1);
    setRuntimeData("pet.taskQueue", [...queue]);
  }

  removeTaskById(taskId: string) {
    const queue = this.taskQueueState?.get() || [];
    const newQueue = queue.filter(t => t.id !== taskId);
    setRuntimeData("pet.taskQueue", newQueue);
  }

  clearQueue() {
    setRuntimeData("pet.taskQueue", []);
  }

  private async startNextTask() {
    const queue = this.taskQueueState?.get() || [];
    if (queue.length === 0) return;

    const task = queue[0];
    // Assign ID if it doesn't have one (for backwards compatibility/unexpected insertions)
    if (!task.id) {
      task.id = generateTaskId();
    }
    const taskId = task.id; // Use real unique ID
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
        this.removeTaskById(taskId);
        this.retryCounts.delete(taskId);
      } else {
        const retryCount = (this.retryCounts.get(taskId) || 0) + 1;
        this.retryCounts.set(taskId, retryCount);
        if (retryCount > maxRetry) {
          console.warn(
            "TaskQueueService: task failed too many times, removing from queue.",
            task,
          );
          this.removeTaskById(taskId);
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
