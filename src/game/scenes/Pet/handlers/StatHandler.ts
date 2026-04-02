import Phaser from "phaser";
import {
  runtimeData,
  getRuntimeDataGroup,
  setRuntimeData,
  ObservableValue,
} from "@/game/runtimeData";
import { getStaticData } from "@/game/staticData";
import { ActionEffect } from "../elements/PetCharacter/types";
import {
  KnownRuntimeDataKey,
  RuntimeDataValue,
} from "@/game/runtimeData/types";
import {
  getPetRuntimeDataKey,
  PET_CORE_RUNTIME_KEYS,
  PET_STATIC_KEYS,
} from "../constants";
import { StatItem } from "../types";

export class StatsHandler {
  private group: StatHandler<KnownRuntimeDataKey>[] = [];
  constructor(scene: Phaser.Scene) {
    const stats = getStaticData(PET_STATIC_KEYS.STATS);

    stats.forEach(({ id, min, max }: StatItem) => {
      const handler = new StatHandler(
        scene,
        getPetRuntimeDataKey(id) as KnownRuntimeDataKey,
        min,
        max,
      );
      handler.init();
      this.group.push(handler);
    });
  }

  runEffect(effect: Partial<Record<string, ActionEffect>>) {
    if (!effect) return;
    this.group.forEach((handler) => {
      handler.runEffect(effect);
    });
  }

  destroy() {
    this.group.forEach((handler) => {
      handler.destroy();
    });
  }
}

export class StatHandler<K extends KnownRuntimeDataKey> {
  private timer?: Phaser.Time.TimerEvent;
  private scene: Phaser.Scene;
  private conditionState;
  private statState: ObservableValue<RuntimeDataValue<K>> | undefined;
  private storeKey: K;
  private min: number;
  private max: number;

  constructor(
    scene: Phaser.Scene,
    storeKey: K,
    min = -Infinity,
    max = Infinity,
  ) {
    this.scene = scene;
    this.storeKey = storeKey;
    this.statState = runtimeData(storeKey);
    this.min = min ?? -Infinity;
    this.max = max ?? Infinity;

    this.conditionState = runtimeData(PET_CORE_RUNTIME_KEYS.CONDITION);
  }

  init() {
    this.conditionState?.watch(this.handleSetRule);
    this.handleSetRule(this.conditionState?.get());
  }

  private handleSetRule = (_value: unknown): void => {
    if (this.timer) {
      this.timer.remove();
      this.timer = undefined;
    }
    const conditions = getStaticData(PET_STATIC_KEYS.CONDITIONS);
    const condition = this.conditionState?.get();

    if (!condition || !conditions || typeof conditions !== "object") return;
    const conditionObj = conditions[condition];
    if (!conditionObj || typeof conditionObj !== "object") return;
    const rules = conditionObj;
    const statKey = this.getStatKey();
    if (!rules || !rules[statKey]) return;
    const rule = rules[statKey];
    if (!rule) return;

    this.timer = this.scene.time.addEvent({
      delay: rule.interval,
      loop: true,
      callback: () => {
        const isStopped = getRuntimeDataGroup("global.is_paused");
        if (isStopped) return;
        const currentValue = getRuntimeDataGroup(
          this.storeKey as string,
        ) as number;
        const { method, value } = rule;
        let newValue = 0;
        if (method === "sub") {
          newValue = value * -1;
        } else if (method === "add") {
          newValue = value;
        }
        const result = Math.max(
          this.min,
          Math.min(this.max, currentValue + newValue),
        );
        setRuntimeData(this.storeKey, result as RuntimeDataValue<K>);
      },
    });
  };

  // 取得資源 key (如 'hp', 'mp')
  private getStatKey(): string {
    const parts = (this.storeKey as string).split(".");
    return parts[parts.length - 1];
  }

  public runEffect = (effect: Partial<Record<string, ActionEffect>>): void => {
    if (!effect) return;

    const key = this.getStatKey();
    const statEffect = effect[key];
    if (!statEffect) return;
    const current = getRuntimeDataGroup(this.storeKey as string) as number;
    let effectValue = statEffect.value;
    if (typeof effectValue === "string") {
      effectValue = Number(effectValue) || 0;
    }
    if (statEffect.method === "add") {
      setRuntimeData(
        this.storeKey,
        Math.min(this.max, current + effectValue) as RuntimeDataValue<K>,
      );
    } else if (statEffect.method === "sub") {
      setRuntimeData(
        this.storeKey,
        Math.max(this.min, current - effectValue) as RuntimeDataValue<K>,
      );
    } else if (statEffect.method === "set") {
      setRuntimeData(
        this.storeKey,
        Math.max(
          this.min,
          Math.min(this.max, effectValue),
        ) as RuntimeDataValue<K>,
      );
    }
  };

  destroy() {
    this.statState?.unwatchAll();
    if (this.timer) {
      this.timer.remove();
      this.timer = undefined;
    }
  }
}
