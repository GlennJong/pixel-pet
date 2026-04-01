import { getStaticData } from "@/game/staticData";
import { runtimeData, getRuntimeDataGroup, ObservableValue } from "@/game/runtimeData";
import { KnownRuntimeDataKey } from "@/game/runtimeData/types";
import { GAME_CONFIG } from "@/game/constants";
import { ActionDef, ActionConditionRule, CharacterStageItem } from "../types";

export class AutoActionHandler {
  private autoWatchers: { key: KnownRuntimeDataKey; handler: (v: unknown) => void }[] = [];
  private cache: Partial<Record<KnownRuntimeDataKey, unknown>> = {};
  private autoActions: ActionDef[] = [];
  private onTrigger?: (action: ActionDef) => void;
  private lastTriggeredAction: string | null = null; // Prevent repeated triggers

  private levelWatcher?: ObservableValue<unknown>;

  constructor() {
    this.setupActions();

    const config = getStaticData(`pet.${GAME_CONFIG.PET.DEFAULT_CHARACTER_KEY}`);
    if (config.watch && config.stages) {
      this.levelWatcher = runtimeData(`pet.${config.watch}` as KnownRuntimeDataKey);
      this.levelWatcher?.watch(() => {
        this.reinit();
      });
    }
  }

  private setupActions() {
    const config = getStaticData(`pet.${GAME_CONFIG.PET.DEFAULT_CHARACTER_KEY}`);
    let actions: Record<string, ActionDef> = {};
    if (config.watch && config.stages) {
       const level = getRuntimeDataGroup(`pet.${config.watch}`) || 0;
       const current = config.stages.find((l: CharacterStageItem) => l.value === level) || config.stages[0];
       actions = current.actions || {};
    } else {
       actions = config.actions || {};
    }
    // Filter out actions that are not set to auto or have no conditions
    this.autoActions = Object.values(actions).filter(
      (a): a is ActionDef & { condition: NonNullable<ActionDef["condition"]> } =>
        Boolean(a.auto && a.condition),
    );
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
      if (a.condition) {
        Object.keys(a.condition).forEach((k) => watchedKeys.add(k as KnownRuntimeDataKey));
      }
    });

    watchedKeys.forEach((key) => {
      // Use generic runtimeData to get any type of value
      this.cache[key] = runtimeData(`pet.${key}` as KnownRuntimeDataKey)?.get();
      const handler = this.makeHandler(key);
      runtimeData(`pet.${key}` as KnownRuntimeDataKey)?.watch(handler);
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
    // Find the first action where all conditions are met
    const matchAction = this.autoActions.find((a) => {
      if (!a.condition) return false;
      return Object.entries(a.condition).every(([k, cond]) => {
        const val = this.cache[k as KnownRuntimeDataKey] as number | string | undefined;

        // Array inclusion check
        if (Array.isArray(cond)) {
          return cond.includes(val);
        }

        // Object comparison (op/value)
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

        // Exact match
        return val === cond;
      });
    });

    if (matchAction) {
      // Only trigger if it's a new action
      if (this.lastTriggeredAction !== matchAction.action) {
        this.onTrigger?.(matchAction);
        this.lastTriggeredAction = matchAction.action;
      }
    } else {
      this.lastTriggeredAction = null;
    }
  }

  clearWatchers() {
    for (const { key, handler } of this.autoWatchers) {
      runtimeData(`pet.${key}` as KnownRuntimeDataKey)?.unwatch(handler);
    }
    this.autoWatchers = [];
  }

  destroy() {
    this.clearWatchers();
  }
}
