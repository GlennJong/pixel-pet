import { ConfigManager } from "@/game/managers/ConfigManagers";
import { getStoreState, store } from "@/game/store";
import { GAME_CONFIG } from "@/game/config";

const STORE_KEY = "pet.status";
// Use the config key dynamically
const CONFIG_KEY = `pet.${GAME_CONFIG.PET.DEFAULT_CHARACTER_KEY}.statuses`;

export class StatusHandler {
  private config = ConfigManager.getInstance().get(CONFIG_KEY) || undefined;
  // Initialize type to number? 'pet.status' seems to be a string ('normal', 'sleep' etc.)
  // but `store<number>` was used. Checked MainScene.ts: initStore('pet.status', 'normal');
  // So it should be `store<string>`.
  private statusState = store<string>(STORE_KEY);

  constructor() {}

  public getStatus(): string {
    return getStoreState("pet.status");
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
