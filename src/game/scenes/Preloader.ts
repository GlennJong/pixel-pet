import { Scene } from "phaser";
import { ConfigManager } from "../managers/ConfigManagers";

export class Preloader extends Scene {
  constructor() {
    super("Preloader");
  }

  private getConfigsFiles(ipId: string) {
    return [
      { key: "ui", filename: "ui.config.json" },
      { key: "mapping", filename: "mapping.config.json" },
      { key: `config_${ipId}_assets`, filename: `config/${ipId}/assets.json` },
      {
        key: `config_${ipId}_stats`,
        filename: `config/${ipId}/stats.json`,
      },
      {
        key: `config_${ipId}_conditions`,
        filename: `config/${ipId}/conditions.json`,
      },
      { key: `config_${ipId}_header`, filename: `config/${ipId}/header.json` },
      {
        key: `config_${ipId}_mycharacter`,
        filename: `config/${ipId}/character.json`,
      },
      { key: `config_${ipId}_room`, filename: `config/${ipId}/room.json` },
    ];
  }

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
      // Assuming customConfig always applies to the default 'pet' for now
      ConfigManager.getInstance().setIpId("pet");
      this.cache.json.add("config", customConfig);
      this._preloadAssetsFromConfig(customConfig, "pet");
    } else {
      // Allow dynamic IP loading, e.g. from URL or default to "pet"
      const urlParams = new URLSearchParams(window.location.search);
      const ipId = urlParams.get("ip") || "pet";
      ConfigManager.getInstance().setIpId(ipId);
      const configsFiles = this.getConfigsFiles(ipId);

      // Main config json file
      let num = 0;
      let result = {};

      for (const { key, filename } of configsFiles) {
        this.load.json(key, filename);
        this.load.on(
          `filecomplete-json-${key}`,
          (_key: unknown, _type: unknown, data: any) => {
            num += 1;

            if (key.startsWith(`config_${ipId}_`)) {
              const subKey = key.replace(`config_${ipId}_`, "");
              // Keep it named 'pet' internally for now, or use [ipId] if you prefer all code to dynamic. 
              // For compatibility, we map it to 'pet' or use the ipId directly.
              const currentPet = (result as any)[ipId] || {};
              result = {
                ...result,
                [ipId]: {
                  ...currentPet,
                  [subKey]: data,
                },
              };
            } else {
              result = {
                ...result,
                [key]: data,
              };
            }

            if (num === configsFiles.length) {
              this.cache.json.add("config", result);
              this._preloadAssetsFromConfig(result, ipId);
            }
          },
        );
      }
    }

    // Preload Fonts
    this.load.font("BoutiqueBitmap", "fonts/BoutiqueBitmap9x9.ttf", "truetype");
    this.load.font("Tiny5", "fonts/Tiny5-Regular.ttf", "truetype");
  }

  _preloadAssetsFromConfig(data: any, ipId: string = "pet") {
    const { ui, [ipId]: currentIpConfig } = data;
    // Preload ui assets
    if (ui) {
      Object.keys(ui).map((key) => {
        this.load.atlas(ui[key].key, ui[key].preload.png, ui[key].preload.json);
      });
    }
    // Preload pet assets
    if (currentIpConfig?.assets) {
      for (const [key, { png, json }] of Object.entries(
        currentIpConfig.assets as Record<string, { png: string; json: string }>,
      )) {
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
