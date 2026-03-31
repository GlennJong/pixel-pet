import { Scene } from "phaser";
import { ConfigManager } from "../managers/ConfigManagers";
import { CONFIG_COMMAND_MAP_KEY } from "./Pet/services/constants";

export class Preloader extends Scene {
  constructor() {
    super("Preloader");
  }

  private getConfigsFiles() {
    return [
      { key: "ui", filename: "configs/global/ui.json" },
      { key: CONFIG_COMMAND_MAP_KEY, filename: "configs/global/commands.json" },
      { key: `config_pet_assets`, filename: `configs/pet/assets.json` },
      {
        key: `config_pet_stats`,
        filename: `configs/pet/stats.json`,
      },
      {
        key: `config_pet_conditions`,
        filename: `configs/pet/conditions.json`,
      },
      { key: `config_pet_header`, filename: `configs/pet/header.json` },
      {
        key: `config_pet_mycharacter`,
        filename: `configs/pet/character.json`,
      },
      { key: `config_pet_room`, filename: `configs/pet/room.json` },
    ];
  }

  init() {
    this.add.image(512, 384, "background");
  }

  preload() {
    this.load.setPath("");

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
      const configsFiles = this.getConfigsFiles();

      let num = 0;
      let result = {};

      for (const { key, filename } of configsFiles) {
        this.load.json(key, filename);
        this.load.on(
          `filecomplete-json-${key}`,
          (_key: unknown, _type: unknown, data: any) => {
            num += 1;

            if (key.startsWith(`config_pet_`)) {
              const subKey = key.replace(`config_pet_`, "");
              const currentPet = (result as any)["pet"] || {};
              result = {
                ...result,
                pet: {
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
              this._preloadAssetsFromConfig(result);
            }
          },
        );
      }
    }

    this.load.font("BoutiqueBitmap", "assets/fonts/BoutiqueBitmap9x9.ttf", "truetype");
    this.load.font("Tiny5", "assets/fonts/Tiny5-Regular.ttf", "truetype");
  }

  _preloadAssetsFromConfig(data: any) {
    const { ui, pet: currentConfig } = data;
    if (ui) {
      Object.keys(ui).map((key) => {
        this.load.atlas(ui[key].key, ui[key].preload.png, ui[key].preload.json);
      });
    }
    if (currentConfig?.assets) {
      for (const [key, { png, json }] of Object.entries(
        currentConfig.assets as Record<string, { png: string; json: string }>,
      )) {
        this.load.atlas(key, png, json);
      }
    }
  }

  create() {
    const data = this.cache.json.get("config");
    ConfigManager.getInstance().setConfig(data);
    this.scene.start("MainScene");
  }
}
