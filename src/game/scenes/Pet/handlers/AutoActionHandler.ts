import { ConfigManager } from "@/game/managers/ConfigManagers";
import { store } from "@/game/store";
import { GAME_CONFIG } from "@/game/config";

export interface AutoActionConfig {
  auto: boolean;
  condition: Record<string, any>;
  [key: string]: any;
}

export class AutoActionHandler {
  private _autoWatchers: { key: string; handler: (v: any) => void }[] = [];
  private cache: Record<string, any> = {};
  private autoActions: AutoActionConfig[] = [];
  private onTrigger?: (action: any) => void;
  private lastTriggeredAction: string | null = null; // Prevent repeated triggers

  constructor() {
    const actions = ConfigManager.getInstance().get(
      `pet.${GAME_CONFIG.PET.DEFAULT_CHARACTER_KEY}.actions`,
    );
    // Filter out actions that are not set to auto or have no conditions
    this.autoActions = Object.values(actions).filter(
      (a: any) => a.auto && a.condition,
    );
  }

  public init({ onTrigger }: { onTrigger?: (action: any) => void }) {
    if (onTrigger) {
      this.onTrigger = onTrigger;
    }

    this.clearWatchers();

    // Cache initial values and setup listeners
    const watchedKeys = new Set(
      this.autoActions.flatMap((a) => Object.keys(a.condition)),
    );

    watchedKeys.forEach((key) => {
      // Use generic store to get any type of value
      this.cache[key] = store<any>(`pet.${key}`)?.get();
      const handler = this.makeHandler(key);
      store<any>(`pet.${key}`)?.watch(handler);
      this._autoWatchers.push({ key, handler });
    });
  }

  private makeHandler = (key: string) => {
    return (v: any) => {
      this.cache[key] = v;
      this.checkConditions();
    };
  };

  private checkConditions() {
    // Find the first action where all conditions are met
    const matchAction = this.autoActions.find((a) => {
      return Object.keys(a.condition).every((k) => {
        const cond = a.condition[k];
        const val = this.cache[k];

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
          switch (cond.op) {
            case "==":
              return val === cond.value;
            case ">=":
              return val >= cond.value;
            case "<=":
              return val <= cond.value;
            case ">":
              return val > cond.value;
            case "<":
              return val < cond.value;
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
      // Reset if no action matches, or maybe we want to keep the last one?
      // Logic suggests if condition fails, we might want to reset the lock so it can trigger again later.
      // But for things like "hp < 20", it will be true for a while.
      // If we reset here, it might toggle if multiple actions compete.
      this.lastTriggeredAction = null;
    }
  }

  clearWatchers() {
    for (const { key, handler } of this._autoWatchers) {
      store<any>(`pet.${key}`)?.unwatch(handler);
    }
    this._autoWatchers = [];
  }

  destroy() {
    this.clearWatchers();
  }
}
