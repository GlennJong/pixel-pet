import { getStaticData } from "@/game/staticData";
import { runtimeData, getRuntimeDataGroup, ObservableValue } from "@/game/runtimeData";
import { KnownRuntimeDataKey } from "@/game/runtimeData/types";
import { PET_DEFAULT_CHARACTER_KEY } from "@/game/constants";
import { getPetRuntimeDataKey, getPetStaticDataKey } from "../constants";
import { ActionDef, ActionConditionRule, CharacterStageItem } from "../types";

interface AutoActionRule {
  action: string;
  when: NonNullable<ActionDef["condition"]>;
}

export class AutoActionHandler {
  private autoWatchers: { key: KnownRuntimeDataKey; handler: (v: unknown) => void }[] = [];
  private cache: Partial<Record<KnownRuntimeDataKey, unknown>> = {};
  private autoActions: AutoActionRule[] = [];
  private rawActions: Record<string, ActionDef> = {};
  private onTrigger?: (action: ActionDef) => void;
  private lastTriggeredAction: string | null = null; // Prevent repeated triggers

  private levelWatcher?: ObservableValue<unknown>;

  constructor() {
    this.setupActions();

    const staticKey = getPetStaticDataKey(PET_DEFAULT_CHARACTER_KEY);
    const config = getStaticData(staticKey);
    if (config.watch && config.stages) {
      const watchKey = getPetRuntimeDataKey(config.watch);
      this.levelWatcher = runtimeData(watchKey as KnownRuntimeDataKey);
      this.levelWatcher?.watch(() => {
        this.reinit();
      });
    }
  }

  private setupActions() {
    // 1. Fetch character config for raw actions
    const staticKey = getPetStaticDataKey(PET_DEFAULT_CHARACTER_KEY);
    const config = getStaticData(staticKey);
    if (config.watch && config.stages) {
       const watchKey = getPetRuntimeDataKey(config.watch);
       const level = getRuntimeDataGroup(watchKey) || 0;
       const current = config.stages.find((l: CharacterStageItem) => l.value === level) || config.stages[0];
       this.rawActions = current.actions || {};
    } else {
       this.rawActions = config.actions || {};
    }
    
    // 2. Fetch auto_actions
    const autoActionsKey = getPetStaticDataKey("auto_actions");
    this.autoActions = getStaticData(autoActionsKey) || [];
  }

  public reinit() {
    this.setupActions();
    this.init({ onTrigger: this.onTrigger });
  }

  public init({ onTrigger }: { onTrigger?: (action: ActionDef) => void }) {
    if (onTrigger) {
      this.onTrigger = onTrigger;
    }

    this.clearWatchers();

    // Cache initial values and setup listeners
    const watchedKeys = new Set<KnownRuntimeDataKey>();
    this.autoActions.forEach((a) => {
      if (a.when) {
        Object.keys(a.when).forEach((k) => watchedKeys.add(k as KnownRuntimeDataKey));
      }
    });

    watchedKeys.forEach((key) => {
      const runtimeKey = getPetRuntimeDataKey(key);
      this.cache[key] = runtimeData(runtimeKey as KnownRuntimeDataKey)?.get();
      const handler = this.makeHandler(key);
      runtimeData(runtimeKey as KnownRuntimeDataKey)?.watch(handler);
      this.autoWatchers.push({ key, handler });
    });
  }

  private makeHandler = (key: KnownRuntimeDataKey) => {
    return (v: unknown) => {
      this.cache[key] = v;
      this.checkConditions();
    };
  };

  private checkConditions() {
    const matchRule = this.autoActions.find((a) => {
      if (!a.when) return false;
      return Object.entries(a.when).every(([k, cond]) => {
        const val = this.cache[k as KnownRuntimeDataKey] as number | string | undefined;

        if (Array.isArray(cond)) {
          return cond.includes(val);
        }

        if (
          typeof cond === "object" &&
          cond !== null &&
          "op" in cond &&
          "value" in cond
        ) {
          const rule = cond as ActionConditionRule;
          if (typeof val === "undefined") return false;
          switch (rule.op) {
            case "==":
              return val == rule.value;
            case ">=":
              return Number(val) >= Number(rule.value);
            case "<=":
              return Number(val) <= Number(rule.value);
            case ">":
              return Number(val) > Number(rule.value);
            case "<":
              return Number(val) < Number(rule.value);
            default:
              return false;
          }
        }

        return val === cond;
      });
    });

    if (matchRule) {
      if (this.lastTriggeredAction !== matchRule.action) {
        const fullAction = this.rawActions[matchRule.action];
        if (fullAction) {
            this.onTrigger?.(fullAction);
        }
        this.lastTriggeredAction = matchRule.action;
      }
    } else {
      this.lastTriggeredAction = null;
    }
  }

  clearWatchers() {
    for (const { key, handler } of this.autoWatchers) {
      const runtimeKey = getPetRuntimeDataKey(key);
      runtimeData(runtimeKey as KnownRuntimeDataKey)?.unwatch(handler);
    }
    this.autoWatchers = [];
  }

  destroy() {
    this.clearWatchers();
  }
}
