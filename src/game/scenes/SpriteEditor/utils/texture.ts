import Phaser from 'phaser';
import { TEXTURE_LOAD_TIMEOUT_MS } from '../constants';

/** Shared key prefix for every temporary texture the editor generates. */
export const EDITOR_IMAGE_PREFIX = 'editor_img_';

/**
 * Remove every editor-generated texture (`editor_img_*`) from the (game-global)
 * texture manager. Editor textures accumulate otherwise — e.g. re-importing a
 * smaller atlas leaves higher-indexed keys resident, and deleting/replacing
 * images never freed them. Call before a full re-import and on scene shutdown.
 */
export function removeEditorImageTextures(scene: Phaser.Scene): void {
  scene.textures
    .getTextureKeys()
    .filter((key) => key.startsWith(EDITOR_IMAGE_PREFIX))
    .forEach((key) => scene.textures.remove(key));
}

/**
 * Load a base64/data-URL image into the scene texture manager and resolve with
 * its frame once ready. Replaces any existing texture under the same key and
 * rejects if the async `addBase64` doesn't complete within `timeoutMs`.
 */
export function loadTextureFromDataUrl(
  scene: Phaser.Scene,
  textureKey: string,
  dataUrl: string,
  timeoutMs: number = TEXTURE_LOAD_TIMEOUT_MS,
): Promise<Phaser.Textures.Frame> {
  return new Promise((resolve, reject) => {
    if (scene.textures.exists(textureKey)) {
      scene.textures.remove(textureKey);
    }

    const eventName = `addtexture-${textureKey}`;
    const timer = setTimeout(() => {
      scene.textures.off(eventName, onAdded);
      reject(new Error(`Timed out while adding texture "${textureKey}".`));
    }, timeoutMs);

    const onAdded = () => {
      clearTimeout(timer);
      const frame = scene.textures.getFrame(textureKey);
      if (!frame) {
        reject(new Error(`Missing texture frame "${textureKey}".`));
        return;
      }
      resolve(frame);
    };

    scene.textures.once(eventName, onAdded);

    try {
      scene.textures.addBase64(textureKey, dataUrl);
    } catch (error) {
      clearTimeout(timer);
      scene.textures.off(eventName, onAdded);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
