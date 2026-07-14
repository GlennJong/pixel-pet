import Phaser from "phaser";
import { getStaticData } from "@/game/staticData";

type JsonObject = Record<string, unknown>;

interface SaveAtlasCustomizationInput {
  atlasId: string;
  spritesheetPng: Blob;
  spritesheetJson: JsonObject;
  // animations.json is an array of AnimationItem; stringified verbatim.
  animations: unknown;
}

interface PreloadConfig {
  assets?: {
    atlases?: Array<{
      atlasId: string;
      png: string;
      json: string;
      animations?: string;
    }>;
    fonts?: Array<{ key: string; url: string; format: string }>;
  };
  [key: string]: unknown;
}

const CUSTOM_CONFIG_KEY = "custom_config";
const CUSTOMIZATION_STATE_KEY = "customization_state";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Failed to encode blob as data URL."));
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read blob."));
    reader.readAsDataURL(blob);
  });
}

function readCustomConfig(): PreloadConfig {
  if (typeof window === "undefined") return {};

  try {
    const raw = localStorage.getItem(CUSTOM_CONFIG_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PreloadConfig;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("[customization] Failed to read custom config", error);
    return {};
  }
}

function writeCustomConfig(config: PreloadConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CUSTOM_CONFIG_KEY, JSON.stringify(config));
}

export async function saveAtlasCustomization(input: SaveAtlasCustomizationInput): Promise<void> {
  const { atlasId, spritesheetPng, spritesheetJson, animations } = input;

  const [pngDataUrl, jsonDataUrl, animationsDataUrl] = await Promise.all([
    blobToDataUrl(spritesheetPng),
    blobToDataUrl(new Blob([JSON.stringify(spritesheetJson)], { type: "application/json" })),
    blobToDataUrl(new Blob([JSON.stringify(animations)], { type: "application/json" })),
  ]);

  const config = readCustomConfig();
  const assets = (config.assets ||= {});
  const atlases = (assets.atlases ||= []);

  const nextAtlas = {
    atlasId,
    png: pngDataUrl,
    json: jsonDataUrl,
    animations: animationsDataUrl,
  };

  const existingIndex = atlases.findIndex((item) => item.atlasId === atlasId);
  if (existingIndex >= 0) {
    atlases[existingIndex] = nextAtlas;
  } else {
    atlases.push(nextAtlas);
  }

  writeCustomConfig(config);
}

export function setCustomizationActive(active: boolean, atlasId?: string): void {
  if (typeof window === "undefined") return;

  const payload = {
    active,
    atlasId: atlasId || "",
    updatedAt: Date.now(),
  };

  localStorage.setItem(CUSTOMIZATION_STATE_KEY, JSON.stringify(payload));
}

/** Remove every animation registered under `${atlasId}_*` from the (global) manager. */
function removeAtlasAnimations(scene: Phaser.Scene, atlasId: string): void {
  const map = (scene.anims as unknown as { anims?: { keys?: () => string[]; entries?: Record<string, unknown> } }).anims;
  if (!map) return;
  const keys = typeof map.keys === "function" ? map.keys() : Object.keys(map.entries || {});
  keys
    .filter((key) => key.startsWith(`${atlasId}_`))
    .forEach((key) => scene.anims.remove(key));
}

/**
 * Hot-reload a saved atlas customization into a running scene so the change is
 * visible without a full page reload. Removes the stale texture + animations,
 * reloads the atlas from the persisted data-URLs, and refreshes
 * `staticData.assets.animationsByAtlas[atlasId]` (mirroring Preloader.create()).
 *
 * Resolves once the loader completes; the caller then restarts the consuming
 * scene (e.g. "Pet") so it rebuilds animations from the refreshed atlas.
 */
export function reloadAtlasIntoScene(scene: Phaser.Scene, atlasId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const config = readCustomConfig();
    const entry = config.assets?.atlases?.find((item) => item.atlasId === atlasId);
    if (!entry) {
      reject(new Error(`No saved customization for atlas: ${atlasId}`));
      return;
    }

    removeAtlasAnimations(scene, atlasId);
    if (scene.textures.exists(atlasId)) scene.textures.remove(atlasId);

    const animKey = `anim_${atlasId}`;
    if (scene.cache.json.exists(animKey)) scene.cache.json.remove(animKey);

    scene.load.atlas(atlasId, entry.png, entry.json);
    if (entry.animations) scene.load.json(animKey, entry.animations);

    scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
      const animData = scene.cache.json.get(animKey);
      if (animData) {
        const assets = getStaticData<Record<string, unknown>>("assets");
        if (assets) {
          const byAtlas = (assets.animationsByAtlas ||= {}) as Record<string, unknown>;
          byAtlas[atlasId] = animData;
        }
      }
      resolve();
    });

    scene.load.start();
  });
}
