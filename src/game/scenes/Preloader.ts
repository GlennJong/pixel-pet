import { Scene } from "phaser";
import { setStaticData } from "../staticData";
import { initI18n } from "../utils/i18n";
import { StaticDataSchema } from "../staticData/types";
import { ProgressBar } from "../components/ProgressBar";
import { PROGRESS_BAR_CONFIG } from "../constants";
import { runtimeData } from "../runtimeData";
import { getAtlasCustomizations } from "../customization";

interface PreloadConfig extends Partial<StaticDataSchema> {
  assets?: {
    atlases?: Array<{ atlasId: string; png: string; json: string; animations?: string }>;
    fonts?: Array<{ key: string; url: string; format: string }>;
    animationsByAtlas?: Record<string, any>;
  };
  locales?: {
    "zh-tw"?: any;
  };
}

/**
 * A stored config is usable as a full replacement for configs/manifest.json only
 * if it carries more than the assets section.
 */
function isFullConfig(config: PreloadConfig | null): boolean {
  if (!config || typeof config !== "object") return false;
  return Object.keys(config).some((key) => key !== "assets");
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
    // Anchor every load to the app base; a bare "" resolves against the current
    // document path, so any non-root URL 404s into index.html.
    this.load.setPath(import.meta.env.BASE_URL || "/");

    let customConfig: PreloadConfig | null = null;
    if (typeof window !== "undefined") {
      try {
        const local = localStorage.getItem("custom_config");
        if (local) {
          const parsed = JSON.parse(local) as PreloadConfig;
          // "custom_config" is the ConfigEditor's FULL override. A value holding
          // nothing but assets is a partial overlay from an older build; booting
          // it would leave the game with no system/pet/locale config at all.
          customConfig = isFullConfig(parsed) ? parsed : null;
        }
      } catch (e) {
        console.error(e);
      }
    }

    if (customConfig) {
      this._applyAtlasCustomizations(customConfig);
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
                this._applyAtlasCustomizations(result);
                this.cache.json.add("config", result);
                this._preloadAssetsFromConfig(result);
              }
            },
          );
        }
      });
    }


  }

  /**
   * Overlay the Sprite Editor's saved atlases (data URLs) on top of the
   * manifest's, matching by atlasId. Replaces the entry in place so every other
   * atlas — and every non-asset config section — survives.
   */
  _applyAtlasCustomizations(data: PreloadConfig) {
    const customizations = getAtlasCustomizations();
    if (customizations.length === 0) return;

    data.assets = data.assets || {};
    const atlases = (data.assets.atlases = data.assets.atlases || []);
    for (const entry of customizations) {
      const index = atlases.findIndex((item) => item.atlasId === entry.atlasId);
      if (index >= 0) atlases[index] = entry;
      else atlases.push(entry);
    }
  }

  _preloadAssetsFromConfig(data: PreloadConfig) {
    const atlases = data.assets?.atlases || [];
    for (const { atlasId, png, json, animations } of atlases) {
      this.load.atlas(atlasId, png, json);
      if (animations) {
        this.load.json(`anim_${atlasId}`, animations);
      }
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

    // Merge per-atlas animations.json into staticData under assets.animationsByAtlas
    const atlases: Array<{ atlasId: string; animations?: string }> = data.assets?.atlases || [];
    data.assets = data.assets || {};
    data.assets.animationsByAtlas = {};
    for (const { atlasId, animations } of atlases) {
      if (animations) {
        const animData = this.cache.json.get(`anim_${atlasId}`);
        if (animData) {
          data.assets.animationsByAtlas[atlasId] = animData;
        }
      }
    }

    setStaticData(data as StaticDataSchema);

    // 修正 locales 取得方式，對應 manifest 結構
    if (data.locales && data.locales['zh-tw']) {
      initI18n(data.locales['zh-tw']);
    }

    this.scene.start("MainScene");
  }
}
