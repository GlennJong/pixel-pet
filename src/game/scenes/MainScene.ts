import { Scene } from "phaser";
import {
  getIsAutoSaveEnabled,
  hasSaveData,
  initRuntimeData,
  loadAllRuntimeDataFromLocalStorage,
} from "@/game/runtimeData";
import { GAME_CONFIG } from "@/game/constants";

export class MainScene extends Scene {
  constructor() {
    super("MainScene");
  }

  async create() {
    const isAutoSave = getIsAutoSaveEnabled();
    const isSavedStoreExisted = hasSaveData();

    if (isAutoSave && isSavedStoreExisted) {
      await loadAllRuntimeDataFromLocalStorage();
    }

    // ============================================
    // Global Domain Initialization
    // ============================================
    initRuntimeData("global.is_paused", false);
    initRuntimeData("global.transmit", GAME_CONFIG.GLOBAL.DEFAULT_TRANSMIT);
    initRuntimeData("global.messageQueue", []);

    this.scene.start("Pet");
  }

  shutdown() {}
}
