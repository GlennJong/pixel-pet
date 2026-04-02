import { Scene } from "phaser";
import { setStaticData } from "../staticData";
import { StaticDataSchema } from "../staticData/types";

interface UIConfig {
  assets?: Record<string, { png: string; json: string }>;
}

interface PreloadConfig extends Partial<StaticDataSchema> {
  ui?: UIConfig;
}

export class Preloader extends Scene {
  constructor() {
    super("Preloader");
  }

  private getConfigsFiles() {
    return [
      { key: "config_ui_assets", filename: "configs/ui/assets.json" },
      { key: 'commands', filename: "configs/global/commands.json" },
      { key: `config_pet_assets`, filename: `configs/pet/assets.json` },
      {
        key: `config_pet_stats`,
        filename: `configs/pet/character/stats.json`,
      },
      {
        key: `config_pet_conditions`,
        filename: `configs/pet/character/conditions.json`,
      },
      { key: `config_pet_header`, filename: `configs/pet/ui/header.json` },
      {
        key: `config_pet_character`,
        filename: `configs/pet/character/main.json`,
      },
      {
        key: `config_pet_auto_actions`,
        filename: `configs/pet/character/auto_actions.json`,
      },
      {
        key: `config_pet_effects`,
        filename: `configs/pet/character/effects.json`,
      },
      { key: `config_pet_room`, filename: `configs/pet/environment/room.json` },
    ];
  }

  init() {
    this.add.image(512, 384, "background");
  }

  preload() {
    this.load.setPath("");

    let customConfig: PreloadConfig | null = null;
    if (typeof window !== "undefined") {
      try {
        const local = localStorage.getItem("custom_config");
        if (local) customConfig = JSON.parse(local) as PreloadConfig;
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
      let result: PreloadConfig = { pet: {} } as PreloadConfig;

      for (const { key, filename } of configsFiles) {
        this.load.json(key, filename);
        this.load.on(
          `filecomplete-json-${key}`,
          (_key: unknown, _type: unknown, data: unknown) => {
            num += 1;

            if (key.startsWith(`config_pet_`)) {
              const subKey = key.replace(`config_pet_`, "");
              const currentPet = result.pet || {};
              result.pet = {
                ...currentPet,
                [subKey]: data,
              } as PreloadConfig["pet"];
            } else if (key.startsWith(`config_ui_`)) {
              const subKey = key.replace(`config_ui_`, "");
              const currentUi = result.ui || {};
              result.ui = {
                ...currentUi,
                [subKey]: data,
              } as unknown as PreloadConfig["ui"];
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

  _preloadAssetsFromConfig(data: PreloadConfig) {
    const { ui, pet } = data;

    const allAssets: Record<string, { png: string; json: string }> = {
      ...(ui?.assets || {}),
      ...(pet?.assets as Record<string, { png: string; json: string }> || {}),
    };

    for (const [key, { png, json }] of Object.entries(allAssets)) {
      this.load.atlas(key, png, json);
    }
  }

  create() {
    const data = this.cache.json.get("config") as StaticDataSchema;
    setStaticData(data);
    this.scene.start("MainScene");
  }
}
