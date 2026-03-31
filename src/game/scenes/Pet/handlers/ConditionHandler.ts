import { ConfigManager } from "@/game/managers/ConfigManagers";
import { getStoreState, store, Store } from "@/game/store";
import { GAME_CONFIG } from "@/game/constants";

export class ConditionHandler {
  private config: any;
  private conditionState?: Store<string>;
  

  constructor() {
    
    const configKey = `pet.${GAME_CONFIG.PET.DEFAULT_CHARACTER_KEY}.conditions`;
    this.config = ConfigManager.getInstance().get(configKey) || undefined;
    this.conditionState = store(`pet.condition`);
  }

  public getCondition(): string {
    return getStoreState(`pet.condition`);
  }

  public getConfig(): any {
    const current = this.getCondition();
    return this.config?.[current];
  }

  public runEffect = (effect: any) => {
    if (!effect) return;
    const { condition } = effect;
    if (condition?.method === "set") {
      this.conditionState?.set(condition.value);
    }
  };

  destroy() {
    this.conditionState?.unwatchAll();
  }
}
