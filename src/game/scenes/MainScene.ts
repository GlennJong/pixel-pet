import { Scene } from "phaser";
import {
  getIsAutoSaveEnabled,
  hasSaveData,
  initStore,
  loadAllStoresFromLocalStorage,
} from "@/game/store";
import { ConfigManager } from "../managers/ConfigManagers";
import { GAME_CONFIG } from "@/game/config";
import { ResourceItem } from "./Pet/types";

export class MainScene extends Scene {
  constructor() {
    super("MainScene");
  }

  async create() {
    const isAutoSave = getIsAutoSaveEnabled();
    const isSavedStoreExisted = hasSaveData();

    if (isAutoSave && isSavedStoreExisted) {
      await loadAllStoresFromLocalStorage();
    }

    initStore("global.is_paused", false);
    initStore("global.transmit", GAME_CONFIG.GLOBAL.DEFAULT_TRANSMIT);
    initStore("global.messageQueue", []);

    const ipId = ConfigManager.getInstance().getIpId();
    const resources =
      ConfigManager.getInstance().get<ResourceItem[]>(`${ipId}.resources`) || [];
    resources.forEach(({ key, value }: any) => {
      initStore(`${ipId}.${key}`, value || 0);
    });
    initStore(`${ipId}.hp`, GAME_CONFIG.PET.DEFAULT_HP);
    initStore(`${ipId}.coin`, GAME_CONFIG.PET.DEFAULT_COIN);
    initStore(`${ipId}.level`, GAME_CONFIG.PET.DEFAULT_LEVEL);
    initStore(`${ipId}.win`, 0);

    initStore(`${ipId}.status`, "normal");
    initStore(`${ipId}.taskQueue`, []);

    this.scene.start("Pet");
  }

  shutdown() {}
}
