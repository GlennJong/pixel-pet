import { ConfigManager } from "@/game/managers/ConfigManagers";
import { getStoreState, store, Store } from "@/game/store";
import { GAME_CONFIG } from "@/game/config";

export class ConditionHandler {
  private config: any;
  private conditionState?: Store<string>;
  private ipId: string;

  constructor() {
    this.ipId = ConfigManager.getInstance().getIpId();
    const configKey = `${this.ipId}.${GAME_CONFIG.PET.DEFAULT_CHARACTER_KEY}.conditions`;
    this.config = ConfigManager.getInstance().get(configKey) || undefined;
    this.conditionState = store<string>(`${this.ipId}.condition`);
  }

  public getCondition(): string {
    return getStoreState(`${this.ipId}.condition`);
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
