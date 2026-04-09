import { Scene } from "phaser";
import { setStaticData } from "../staticData";
import { initI18n } from "../utils/i18n";
import { StaticDataSchema } from "../staticData/types";

interface UIConfig {
  assets?: Array<{ atlasId: string; png: string; json: string }>;
}

interface PreloadConfig extends Partial<StaticDataSchema> {
  ui?: UIConfig;
}

export class Preloader extends Scene {
  constructor() {
    super("Preloader");
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
      this.load.json("manifest", "configs/manifest.json");
      this.load.once("filecomplete-json-manifest", (_key: unknown, _type: unknown, data: any[]) => {
        let num = 0;
        let result: PreloadConfig = { pet: {} } as PreloadConfig;

        for (const { key, filename } of data) {
          this.load.json(key, filename);
          this.load.on(
            `filecomplete-json-${key}`,
            (_k: unknown, _t: unknown, fileData: unknown) => {
              num += 1;

              if (key.startsWith(`config_pet_`)) {
                const subKey = key.replace(`config_pet_`, "");
                const currentPet = result.pet || {};
                result.pet = {
                  ...currentPet,
                  [subKey]: fileData,
                } as PreloadConfig["pet"];
              } else if (key.startsWith(`config_ui_`)) {
                const subKey = key.replace(`config_ui_`, "");
                const currentUi = result.ui || {};
                result.ui = {
                  ...currentUi,
                  [subKey]: fileData,
                } as unknown as PreloadConfig["ui"];
              } else {
                result = {
                  ...result,
                  [key]: fileData,
                };
              }

              if (num === data.length) {
                this.cache.json.add("config", result);
                this._preloadAssetsFromConfig(result);
              }
            },
          );
        }
      });
    }

    this.load.font(
      "BoutiqueBitmap",
      "assets/fonts/BoutiqueBitmap9x9.ttf",
      "truetype",
    );
    this.load.font("Tiny5", "assets/fonts/Tiny5-Regular.ttf", "truetype");
  }

  _preloadAssetsFromConfig(data: PreloadConfig) {
    const { ui, pet } = data;

    const allAssets = [
      ...(ui?.assets || []),
      ...((pet?.assets as Array<{
        atlasId: string;
        png: string;
        json: string;
      }>) || []),
    ];

    for (const { atlasId, png, json } of allAssets) {
      this.load.atlas(atlasId, png, json);
    }
  }

  create() {
    const data = this.cache.json.get("config") as StaticDataSchema;
    setStaticData(data);
    if (data.pet && (data.pet as any)["zh-tw"]) {
      initI18n((data.pet as any)["zh-tw"]);
    }
    this.scene.start("MainScene");
  }
}
