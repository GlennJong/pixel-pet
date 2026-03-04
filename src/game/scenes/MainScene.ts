import { Scene } from "phaser";
import { initStore, loadAllStoresFromLocalStorage } from "@/game/store";
import { ConfigManager } from "../managers/ConfigManagers";
import { GAME_CONFIG } from "@/game/config";
import { ResourceItem } from "./Pet/types";

export class MainScene extends Scene {
  constructor() {
    super("MainScene");
  }

  async create() {
    const isAutoSave = localStorage.getItem("isEnableAutoSave") === "true";
    const isSavedStoreExisted = !!localStorage.getItem("pet_store");

    if (isAutoSave && isSavedStoreExisted) {
      await loadAllStoresFromLocalStorage();
    } else {
      initStore("global.is_paused", false);
      initStore("global.transmit", GAME_CONFIG.GLOBAL.DEFAULT_TRANSMIT);
      initStore("global.messageQueue", []);

      const resources = ConfigManager.getInstance().get<ResourceItem[]>("pet.resources");
      resources.forEach(({ key, value }) => {
        initStore(`pet.${key}`, value || 0);
      });
      initStore("pet.hp", GAME_CONFIG.PET.DEFAULT_HP);
      initStore("pet.coin", GAME_CONFIG.PET.DEFAULT_COIN);
      initStore("pet.level", GAME_CONFIG.PET.DEFAULT_LEVEL);
      initStore("pet.win", 0);

      initStore("pet.status", "normal");
      initStore("pet.taskQueue", []);
    }
    this.scene.start("Pet");
  }

  shutdown() {}
}
