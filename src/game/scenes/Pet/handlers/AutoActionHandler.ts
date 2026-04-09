import { getStaticData } from "@/game/staticData";
import {
  runtimeData,
  getRuntimeDataGroup,
  ObservableValue,
} from "@/game/runtimeData";
import { KnownRuntimeDataKey } from "@/game/runtimeData/types";
import {
  getPetRuntimeDataKey,
  getPetStaticDataKey,
  PET_STATIC_KEYS,
} from "../constants";
import { ActionDef, ActionConditionRule, CharacterStageItem } from "../types";

interface AutoActionRule {
  action: string;
  when: NonNullable<ActionDef["condition"]>;
  parsedWhen?: Record<string, any>;
}

export class AutoActionHandler {
  private autoWatchers: {
    key: KnownRuntimeDataKey;
    handler: (v: unknown) => void;
  }[] = [];
  private cache: Partial<Record<KnownRuntimeDataKey, unknown>> = {};
  private autoActions: AutoActionRule[] = [];
  private rawActions: Record<string, ActionDef> = {};
  private onTrigger?: (action: ActionDef & { action: string }) => void;
  private lastTriggeredAction: string | null = null; // Prevent repeated triggers

  private watcher?: ObservableValue<unknown>;

  constructor() {
    this.setupActions();

    const config = getStaticData(PET_STATIC_KEYS.CHARACTER);
    if (config.watch && config.stages) {
      const watchKey = getPetRuntimeDataKey(config.watch);
      this.watcher = runtimeData(watchKey as KnownRuntimeDataKey);
      this.watcher?.watch(() => {
        this.reinit();
      });
    }
  }

  private setupActions() {
    // 1. Fetch character config for raw actions
    const config = getStaticData(PET_STATIC_KEYS.CHARACTER);
    if (config.watch && config.stages) {
      const watchKey = getPetRuntimeDataKey(config.watch);
      const level = getRuntimeDataGroup(watchKey) || 0;
      const current =
        config.stages.find((l: CharacterStageItem) => l.value === level) ||
        config.stages[0];
      this.rawActions = { ...(config.actions || {}), ...(current?.actions || {}) };
    } else {
      this.rawActions = config.actions || {};
    }

    // 2. Fetch auto_actions
    const autoActionsKey = getPetStaticDataKey("autoActions");
    const rawAutoActions: AutoActionRule[] = getStaticData(autoActionsKey) || [];

    // Pre-parse the rules (e.g. converting numeric values to numbers ahead of time)
    this.autoActions = rawAutoActions.map((a) => {
      const parsedWhen: Record<string, any> = {};
      if (a.when) {
        for (const [k, cond] of Object.entries(a.when)) {
          if (
            typeof cond === "object" &&
            cond !== null &&
            "op" in cond &&
            "value" in cond
          ) {
            parsedWhen[k] = { ...cond, numericValue: Number((cond as any).value) };
          } else {
            parsedWhen[k] = cond;
          }
        }
      }
      return { ...a, parsedWhen };
    });
  }

  public reinit() {
    this.setupActions();
    this.init({ onTrigger: this.onTrigger });
  }

  public init({
    onTrigger,
  }: {
    onTrigger?: (action: ActionDef & { action: string }) => void;
  }) {
    if (onTrigger) {
      this.onTrigger = onTrigger;
    }

    this.clearWatchers();

    // Cache initial values and setup listeners
    const watchedKeys = new Set<KnownRuntimeDataKey>();
    this.autoActions.forEach((a) => {
      const targetWhen = a.parsedWhen || a.when;
      if (targetWhen) {
        Object.keys(targetWhen).forEach((k) =>
          watchedKeys.add(k as KnownRuntimeDataKey),
        );
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
      const targetWhen = a.parsedWhen || a.when;
      if (!targetWhen) return false;
      return Object.entries(targetWhen).every(([k, cond]) => {
        const val = this.cache[k as KnownRuntimeDataKey] as
          | number
          | string
          | undefined;

        if (Array.isArray(cond)) {
          return cond.includes(val);
        }

        if (
          typeof cond === "object" &&
          cond !== null &&
          "op" in cond &&
          "value" in cond
        ) {
          const rule = cond as ActionConditionRule & { numericValue: number };
          if (typeof val === "undefined") return false;
          const numVal = Number(val);
          switch (rule.op) {
            case "==":
              return val == rule.value;
            case ">=":
              return numVal >= rule.numericValue;
            case "<=":
              return numVal <= rule.numericValue;
            case ">":
              return numVal > rule.numericValue;
            case "<":
              return numVal < rule.numericValue;
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
          this.onTrigger?.({ ...fullAction, action: matchRule.action });
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
