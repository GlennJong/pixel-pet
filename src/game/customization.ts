import Phaser from "phaser";
import { getStaticData } from "@/game/staticData";
import { AtlasEntry, animationKey } from "@/game/assets";

/** Historical alias kept for callers; an overlay entry *is* an atlas entry. */
type AtlasCustomization = AtlasEntry;

type JsonObject = Record<string, unknown>;

interface SaveAtlasCustomizationInput {
  atlasId: string;
  spritesheetPng: Blob;
  spritesheetJson: JsonObject;
  // animations.json is an array of AnimationItem; stringified verbatim.
  animations: unknown;
  /** The factory entry's pick-list fields, carried onto the overlay. */
  displayName?: string;
  description?: string;
}

interface PreloadConfig {
  assets?: {
    atlases?: AtlasEntry[];
    fonts?: Array<{ key: string; url: string; format: string }>;
  };
  [key: string]: unknown;
}

// The ConfigEditor owns "custom_config": a FULL config override that the
// Preloader loads in place of configs/manifest.json. Atlas customizations are a
// partial overlay (a few atlases, nothing else), so they get their own key —
// writing them into "custom_config" used to make the Preloader boot a config
// with no system/pet/locale sections at all.
const ATLAS_CUSTOMIZATION_KEY = "custom_atlases";
const LEGACY_CUSTOM_CONFIG_KEY = "custom_config";
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

export type { AtlasEntry as AtlasCustomization };

function readCustomConfig(): PreloadConfig {
  if (typeof window === "undefined") return {};

  try {
    const raw = localStorage.getItem(ATLAS_CUSTOMIZATION_KEY);
    if (!raw) return migrateLegacyAtlasCustomizations();
    const parsed = JSON.parse(raw) as PreloadConfig;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.error("[customization] Failed to read atlas customizations", error);
    return {};
  }
}

/**
 * Earlier builds stored atlas customizations inside the ConfigEditor's
 * "custom_config". Lift those atlases out once so an existing save keeps
 * working, and leave the rest of that key alone.
 */
function migrateLegacyAtlasCustomizations(): PreloadConfig {
  try {
    const raw = localStorage.getItem(LEGACY_CUSTOM_CONFIG_KEY);
    if (!raw) return {};
    const legacy = JSON.parse(raw) as PreloadConfig;
    const atlases = legacy?.assets?.atlases;
    if (!Array.isArray(atlases) || atlases.length === 0) return {};
    // Only data-URL entries are customizations; plain paths come from the manifest.
    const customized = atlases.filter((item) => item?.png?.startsWith("data:"));
    if (customized.length === 0) return {};
    const migrated: PreloadConfig = { assets: { atlases: customized } };
    localStorage.setItem(ATLAS_CUSTOMIZATION_KEY, JSON.stringify(migrated));
    return migrated;
  } catch (error) {
    console.error("[customization] Failed to migrate legacy customizations", error);
    return {};
  }
}

function writeCustomConfig(config: PreloadConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ATLAS_CUSTOMIZATION_KEY, JSON.stringify(config));
}

/** Atlas overlays saved by the Sprite Editor's APPLY, for the Preloader to merge. */
export function getAtlasCustomizations(): AtlasCustomization[] {
  const atlases = readCustomConfig().assets?.atlases;
  return Array.isArray(atlases) ? (atlases as AtlasCustomization[]) : [];
}

export async function saveAtlasCustomization(input: SaveAtlasCustomizationInput): Promise<void> {
  const {
    atlasId, spritesheetPng, spritesheetJson, animations, displayName, description,
  } = input;

  const [pngDataUrl, jsonDataUrl, animationsDataUrl] = await Promise.all([
    blobToDataUrl(spritesheetPng),
    blobToDataUrl(new Blob([JSON.stringify(spritesheetJson)], { type: "application/json" })),
    blobToDataUrl(new Blob([JSON.stringify(animations)], { type: "application/json" })),
  ]);

  const config = readCustomConfig();
  const assets = (config.assets ||= {});
  const atlases = (assets.atlases ||= []);

  // Keep the whitelist flag on the overlay: an overlay of an editable atlas is
  // still editable, and the Preloader replaces the manifest entry wholesale.
  const nextAtlas: AtlasEntry = {
    atlasId,
    png: pngDataUrl,
    json: jsonDataUrl,
    animations: animationsDataUrl,
    // Only an editable atlas can reach this call (the editor's APPLY gates on
    // the whitelist), and the Preloader replaces the manifest entry wholesale —
    // so anything that is not regenerated here has to be carried, or the
    // overlay would look non-editable and nameless.
    editable: true,
    ...(displayName ? { displayName } : {}),
    ...(description ? { description } : {}),
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
  const ownPrefix = animationKey(atlasId, "");
  keys
    .filter((key) => key.startsWith(ownPrefix))
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
