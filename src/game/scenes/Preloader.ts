import { Scene } from "phaser";
import { ConfigManager } from "../managers/ConfigManagers";
import { CONFIG_COMMAND_MAP_KEY } from "./Pet/services/constants";

export class Preloader extends Scene {
  constructor() {
    super("Preloader");
  }

  init() {
    this.add.image(512, 384, "background");
  }

  preload() {
    this.load.setPath("");

    // 載入字型
    this.load.font("BoutiqueBitmap", "assets/fonts/BoutiqueBitmap9x9.ttf", "truetype");
    this.load.font("Tiny5", "assets/fonts/Tiny5-Regular.ttf", "truetype");

    // 取得是否有使用者自定義設定
    let customConfig: any = null;
    if (typeof window !== "undefined") {
      try {
        const local = localStorage.getItem("custom_config");
        if (local) customConfig = JSON.parse(local);
      } catch (e) {
        console.error(e);
      }
    }

    if (customConfig) {
      this.cache.json.add("config", customConfig);
      this._preloadAssetsFromConfig(customConfig);
    } else {
      this._loadRemoteConfigs();
    }
  }

  private _loadRemoteConfigs() {
    const configFiles = [
      { key: "ui", url: "configs/global/ui.json" },
      { key: CONFIG_COMMAND_MAP_KEY, url: "configs/global/commands.json" },
      { key: "pet_assets", url: "configs/pet/assets.json" },
      { key: "pet_stats", url: "configs/pet/stats.json" },
      { key: "pet_conditions", url: "configs/pet/conditions.json" },
      { key: "pet_header", url: "configs/pet/header.json" },
      { key: "pet_character", url: "configs/pet/character.json" }, // 實體檔名
      { key: "pet_room", url: "configs/pet/room.json" },
    ];

    // 載入 JSON 配置檔
    configFiles.forEach((file) => this.load.json(file.key, file.url));

    // 當每個指定的 JSON 完成時記錄次數
    let loadedCount = 0;
    configFiles.forEach((file) => {
      this.load.once(`filecomplete-json-${file.key}`, () => {
        loadedCount++;
        // 全部 JSON 都取回後，開始組裝成大物件並載入圖檔
        if (loadedCount === configFiles.length) {
          this._assembleConfigsAndLoadSprites();
        }
      });
    });
  }

  private _assembleConfigsAndLoadSprites() {
    // 建立結構化且清晰的模型，這就是傳給 ConfigManager 及其他服務的資料長相
    const result = {
      ui: this.cache.json.get("ui"),
      [CONFIG_COMMAND_MAP_KEY]: this.cache.json.get(CONFIG_COMMAND_MAP_KEY),
      pet: {
        assets: this.cache.json.get("pet_assets"),
        stats: this.cache.json.get("pet_stats"),
        conditions: this.cache.json.get("pet_conditions"),
        header: this.cache.json.get("pet_header"),
        mycharacter: this.cache.json.get("pet_character"), // 對應遊戲邏輯 DEFAULT_CHARACTER_KEY
        room: this.cache.json.get("pet_room"),
      },
    };

    // 將組好的 Config 快取起來，供 create() 拿取
    this.cache.json.add("config", result);

    this._preloadAssetsFromConfig(result);
  }

  private _preloadAssetsFromConfig(data: any) {
    const { ui, pet } = data;
    
    // 預載 UI 圖集
    if (ui) {
      Object.keys(ui).forEach((key) => {
        this.load.atlas(ui[key].key, ui[key].preload.png, ui[key].preload.json);
      });
    }

    // 預載寵物相關圖集
    if (pet?.assets) {
      Object.entries(pet.assets).forEach(([key, asset]: [string, any]) => {
        this.load.atlas(key, asset.png, asset.json);
      });
    }
  }

  create() {
    // 遊戲載入完畢，初始化設定管理並進入主場景
    const fullConfig = this.cache.json.get("config");
    ConfigManager.getInstance().setConfig(fullConfig);
    this.scene.start("MainScene");
  }
}
