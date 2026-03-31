import { Scene } from "phaser";
import {
  getIsAutoSaveEnabled,
  hasSaveData,
  initRuntimeData,
  loadAllRuntimeDataFromLocalStorage,
} from "@/game/runtimeData";
import { ConfigManager } from "../managers/ConfigManagers";
import { GAME_CONFIG } from "@/game/constants";
import { StatItem } from "./Pet/types";

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

    initRuntimeData("global.is_paused", false);
    initRuntimeData("global.transmit", GAME_CONFIG.GLOBAL.DEFAULT_TRANSMIT);
    initRuntimeData("global.messageQueue", []);

    
    const stats = ConfigManager.getInstance().get<StatItem[]>(`pet.stats`) || [];

    // 設定核心保底預設值
    const defaultStats: Record<string, number | string | any[]> = {
      hp: GAME_CONFIG.PET.DEFAULT_HP,
      coin: GAME_CONFIG.PET.DEFAULT_COIN,
      level: GAME_CONFIG.PET.DEFAULT_LEVEL,
      condition: "normal",
      taskQueue: [],
    };

    // 如果 JSON 有設定擴充屬性，這裡會紀錄。如果有跟預設值重複的 key，JSON 將會覆寫它 (Single Source of Truth)
    stats.forEach(({ key, value }: any) => {
      defaultStats[key] = value || 0;
    });

    // 統一初始化
    for (const [key, value] of Object.entries(defaultStats)) {
      initRuntimeData(`pet.${key}` as any, value);
    }

    this.scene.start("Pet");
  }

  shutdown() {}
}
