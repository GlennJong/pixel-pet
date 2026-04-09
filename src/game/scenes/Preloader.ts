import { Scene } from "phaser";
import { setStaticData } from "../staticData";
import { initI18n } from "../utils/i18n";
import { StaticDataSchema } from "../staticData/types";
import { ProgressBar } from "../components/ProgressBar";
import { PROGRESS_BAR_CONFIG } from "../constants";
import { runtimeData } from "../runtimeData";

interface PreloadConfig extends Partial<StaticDataSchema> {
  assets?: {
    atlases?: Array<{ atlasId: string; png: string; json: string }>;
    fonts?: Array<{ key: string; url: string; format: string }>;
  };
  locales?: {
    "zh-tw"?: any;
  };
}

export class Preloader extends Scene {
  constructor() {
    super("Preloader");
  }

  init() {}

  preload() {
    const core = (runtimeData("system.core") as any)?.get() || { canvas: { width: 160, height: 144 } };
    const barWidth = PROGRESS_BAR_CONFIG.width;
    const barHeight = PROGRESS_BAR_CONFIG.height;
    const barX = (core.canvas.width - barWidth) / 2;
    const barY = (core.canvas.height - barHeight) / 2;
    
    new ProgressBar(this, {
      x: barX,
      y: barY,
      ...PROGRESS_BAR_CONFIG
    });
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
        let result: PreloadConfig = {} as PreloadConfig;

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


  }

  _preloadAssetsFromConfig(data: PreloadConfig) {
    const atlases = data.assets?.atlases || [];
    for (const { atlasId, png, json } of atlases) {
      this.load.atlas(atlasId, png, json);
    }

    const fonts = data.assets?.fonts || [];
    for (const { key, url, format } of fonts) {
      // Phaser's font loader usually handles this if a font plugin is used.
      // But standard phaser 3 doesn't have a built-in 'this.load.font' without custom logic/plugins.
      // Looks like the user had it natively or via a webfont plugin.
      (this.load as any).font(key, url, format);
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
