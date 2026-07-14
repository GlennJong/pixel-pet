import Phaser from 'phaser';
import { TEXTURE_LOAD_TIMEOUT_MS } from '../constants';

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
