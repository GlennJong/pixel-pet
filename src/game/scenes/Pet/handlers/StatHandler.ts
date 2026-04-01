import Phaser from "phaser";
import { runtimeData, getRuntimeDataGroup, setRuntimeData } from "@/game/runtimeData";
import { getStaticData } from "@/game/staticData";

export class StatsHandler {
  private group: StatHandler[] = [];
  constructor(scene: Phaser.Scene) {
    
    const stats = getStaticData(`pet.stats`);

    stats.forEach(({ key, min, max }: any) => {
      const handler = new StatHandler(scene, `pet.${key}`, min, max);
      handler.init();
      this.group.push(handler);
    });
  }

  runEffect(effect: any) {
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

export class StatHandler {
  private timer?: Phaser.Time.TimerEvent;
  private scene: Phaser.Scene;
  private conditionState;
  private statState: ReturnType<typeof runtimeData>;
  private storeKey: string;
  private min: number;
  private max: number;
  

  constructor(
    scene: Phaser.Scene,
    storeKey: string,
    min = -Infinity,
    max = Infinity,
  ) {
    this.scene = scene;
    this.storeKey = storeKey;
    this.statState = runtimeData(storeKey as any) as any;
    this.min = min;
    this.max = max;
    
    this.conditionState = runtimeData(`pet.condition`);
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
    const conditions = getStaticData(`pet.conditions`) as Record<
      string,
      any
    >;
    const condition = this.conditionState?.get();

    if (!condition || !conditions || typeof conditions !== "object") return;
    const conditionObj = conditions[condition];
    if (!conditionObj || typeof conditionObj !== "object") return;
    const rules = conditionObj as Record<string, any>;
    if (!rules || !rules[this.getStatKey()]) return;
    const rule = rules[this.getStatKey()];

    this.timer = this.scene.time.addEvent({
      delay: rule.interval,
      loop: true,
      callback: () => {
        const isStopped = getRuntimeDataGroup("global.is_paused");
        if (isStopped) return;
        const currentValue = getRuntimeDataGroup(this.storeKey) as number;
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
        setRuntimeData(this.storeKey as any, result);
      },
    });
  };

  // 取得資源 key (如 'hp', 'mp')
  private getStatKey(): string {
    const parts = this.storeKey.split(".");
    return parts[parts.length - 1];
  }

  public runEffect = (effect: Record<string, any>): void => {
    if (!effect) return;

    const key = this.getStatKey();
    const statEffect = effect[key];
    if (!statEffect) return;
    const current = getRuntimeDataGroup(this.storeKey) as number;
    if (statEffect.method === "add") {
      setRuntimeData(
        this.storeKey as any,
        Math.min(this.max, current + statEffect.value),
      );
    } else if (statEffect.method === "sub") {
      setRuntimeData(
        this.storeKey as any,
        Math.max(this.min, current - statEffect.value),
      );
    } else if (statEffect.method === "set") {
      setRuntimeData(
        this.storeKey as any,
        Math.max(this.min, Math.min(this.max, statEffect.value)),
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
