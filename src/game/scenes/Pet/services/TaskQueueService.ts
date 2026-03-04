import Phaser from "phaser";

import { store, setStoreState } from "@/game/store";
import { filterFromMatchList } from "@/game/utils/filterFromMatchList";

import { Message, TaskMappingItem, Task } from "./types";
import {
  CONFIG_MAPPING_LIST_KEY,
  MESSAGE_QUEUE_STORE_KEY,
  TASK_QUEUE_STORE_KEY,
} from "./constants";
import { ConfigManager } from "@/game/managers/ConfigManagers";

export class TaskQueueService {
  private taskQueueState = store<Task[]>(TASK_QUEUE_STORE_KEY);
  private messageQueueState = store<Message[]>(MESSAGE_QUEUE_STORE_KEY);
  private timerEvent?: Phaser.Time.TimerEvent;
  private interval?: number;
  private mappingList: TaskMappingItem[] = [];

  private onTask?: (task: Task) => boolean | Promise<boolean>;
  private scene: Phaser.Scene;

  private retryCounts: Map<string, number> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
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
    this.mappingList = Object.values(
      this.scene.cache.json.get("config")[CONFIG_MAPPING_LIST_KEY],
    );

    this.messageQueueState?.watch(this.handleMessageQueueChange);

    this.taskQueueState?.watch(this.handleTaskQueueChange);
  }

  private handleMessageQueueChange = (messages: Message[]) => {
    if (!messages.length) return;
    const tasks: Task[] = [];
    let updated = false;
    messages.forEach((msg) => {
      const result = filterFromMatchList(msg, this.mappingList);
      const config = ConfigManager.getInstance().get("pet.mycharacter.actions");
      if (result) {
        console.log({ result });

        tasks.push({ ...config[result.action], ...msg, ...result });
        updated = true;
      }
    });
    if (updated) {
      const currentTasks = this.taskQueueState?.get() || [];
      setStoreState(TASK_QUEUE_STORE_KEY, [...currentTasks, ...tasks]);
      setStoreState(MESSAGE_QUEUE_STORE_KEY, []);
    }
  };

  private handleTaskQueueChange = (tasks: Task[]) => {
    if (!this.timerEvent && tasks.length > 0) {
      this.startNextTask();
    }
  };

  addTask(task: Task) {
    const queue = this.taskQueueState?.get() || [];
    setStoreState(TASK_QUEUE_STORE_KEY, [...queue, task]);
  }

  addEmergentTask(task: Task) {
    const queue = this.taskQueueState?.get() || [];
    setStoreState(TASK_QUEUE_STORE_KEY, [task, ...queue]);
  }

  removeTask(index: number) {
    const queue = this.taskQueueState?.get() || [];
    if (index < 0 || index >= queue.length) return;
    queue.splice(index, 1);
    setStoreState(TASK_QUEUE_STORE_KEY, [...queue]);
  }

  clearQueue() {
    setStoreState(TASK_QUEUE_STORE_KEY, []);
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
        this.removeTask(0);
        this.retryCounts.delete(taskId);
      } else {
        const retryCount = (this.retryCounts.get(taskId) || 0) + 1;
        this.retryCounts.set(taskId, retryCount);
        if (retryCount > maxRetry) {
          console.warn(
            "TaskQueueService: task failed too many times, removing from queue.",
            task,
          );
          this.removeTask(0);
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
