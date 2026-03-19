import { ConfigManager } from "@/game/managers/ConfigManagers";
import { getStoreState, store, Store } from "@/game/store";
import { GAME_CONFIG } from "@/game/config";

export class StatusHandler {
  private config: any;
  private statusState?: Store<string>;
  private ipId: string;

  constructor() {
    this.ipId = ConfigManager.getInstance().getIpId();
    const configKey = `${this.ipId}.${GAME_CONFIG.PET.DEFAULT_CHARACTER_KEY}.statuses`;
    this.config = ConfigManager.getInstance().get(configKey) || undefined;
    this.statusState = store<string>(`${this.ipId}.status`);
  }

  public getStatus(): string {
    return getStoreState(`${this.ipId}.status`);
  }

  public getConfig(): any {
    const current = this.getStatus();
    return this.config?.[current];
  }

  public runEffect = (effect: any) => {
    if (!effect) return;
    const { status } = effect;
    if (status?.method === "set") {
      this.statusState?.set(status.value);
    }
  };

  destroy() {
    this.statusState?.unwatchAll();
  }
}
