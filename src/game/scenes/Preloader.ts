import { Scene } from "phaser";
import { ConfigManager } from "../managers/ConfigManagers";

export class Preloader extends Scene {
  constructor() {
    super("Preloader");
  }

  private configsFiles = [
    { key: "pet", filename: "pet.config.json" },
    { key: "ui", filename: "ui.config.json" },
    { key: "mapping", filename: "mapping.config.json" },
  ];

  init() {
    this.add.image(512, 384, "background");
  }

  preload() {
    this.load.setPath("assets");

    // 只讀 localStorage，不再讀 window.globalConfig
    let customConfig: any = null;
    if (typeof window !== "undefined") {
      try {
        const local = localStorage.getItem("custom_config");
        if (local) customConfig = JSON.parse(local);
      } catch (e) {
        console.error(e);
      }
    }

    // customConfig = null; // TODO
    if (customConfig) {
      this.cache.json.add("config", customConfig);
      this._preloadAssetsFromConfig(customConfig);
    } else {
      // Main config json file
      let num = 0;
      let result = {};

      for (const { key, filename } of this.configsFiles) {
        this.load.json(key, filename);
        this.load.on(
          `filecomplete-json-${key}`,
          (_key: unknown, _type: unknown, data: any) => {
            num += 1;
            result = {
              ...result,
              [key]: data,
            };
            if (num === this.configsFiles.length) {
              this.cache.json.add("config", result);
              this._preloadAssetsFromConfig(result);
            }
          },
        );
      }
    }

    // Preload Fonts
    this.load.font("BoutiqueBitmap", "fonts/BoutiqueBitmap9x9.ttf", "truetype");
    this.load.font("Tiny5", "fonts/Tiny5-Regular.ttf", "truetype");
  }

  _preloadAssetsFromConfig(data: any) {
    const { ui, pet } = data;
    // Preload ui assets
    if (ui) {
      Object.keys(ui).map((key) => {
        this.load.atlas(ui[key].key, ui[key].preload.png, ui[key].preload.json);
      });
    }
    // Preload pet assets
    if (pet) {
      for (const [key, { png, json }] of Object.entries(pet.assets)) {
        this.load.atlas(key, png, json);
      }
    }
  }

  create() {
    // Set Config Manager
    const data = this.cache.json.get("config");
    ConfigManager.getInstance().setConfig(data);

    // Start First Scene
    this.scene.start("MainScene");
  }
}
