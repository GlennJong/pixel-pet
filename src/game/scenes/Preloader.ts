import { Scene } from "phaser";
import { setStaticData } from "../staticData";
import { initI18n } from "../utils/i18n";
import { StaticDataSchema } from "../staticData/types";

interface PreloadConfig extends Partial<StaticDataSchema> {
  assets?: Array<{ atlasId: string; png: string; json: string }>;
  locales?: {
    "zh-tw"?: any;
  };
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

              const keys = key.split('_');
              let current: any = result;
              for(let i=0; i<keys.length-1; i++) {
                current[keys[i]] = current[keys[i]] || {};
                current = current[keys[i]];
              }
              current[keys[keys.length-1]] = fileData;

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
    const allAssets = data.assets || [];

    for (const { atlasId, png, json } of allAssets) {
      this.load.atlas(atlasId, png, json);
    }
  }

  create() {
    const data = this.cache.json.get("config");
    setStaticData(data as StaticDataSchema);
    
    if (data.locales && data.locales["zh-tw"]) {
      initI18n(data.locales["zh-tw"]);
    }
    
    this.scene.start("MainScene");
  }
}
