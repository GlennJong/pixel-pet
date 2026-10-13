import Phaser from 'phaser';
import { EditorState, ImageItem } from '../types';
import { loadTextureFromDataUrl } from './texture';

/**
 * Adding and removing the project's source images.
 *
 * Both the library and the frame selector manage material now, so this lives
 * outside either of them: two copies of "allocate an id, load a texture, free
 * it again" would drift, and a drift here leaks textures or strands sprite
 * frames pointing at images that no longer exist.
 */

/**
 * Hidden file input, kept out of the screens because it is a DOM node with a
 * lifetime: created once, removed on destroy. The browser only opens a file
 * dialog from a user gesture, so `open()` must be called from a click or key
 * handler, not from a promise continuation.
 */
export class ImageFilePicker {
  private readonly input: HTMLInputElement;
  private readonly onFiles: (files: File[]) => void;

  constructor(onFiles: (files: File[]) => void, accept = 'image/png,image/jpeg,image/gif,image/webp') {
    this.onFiles = onFiles;
    this.input = document.createElement('input');
    this.input.type = 'file';
    this.input.accept = accept;
    this.input.multiple = true;
    this.input.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:0;height:0;';
    document.body.appendChild(this.input);
    this.input.addEventListener('change', this.handleChange);
  }

  open() {
    this.input.click();
  }

  destroy() {
    this.input.removeEventListener('change', this.handleChange);
    this.input.parentNode?.removeChild(this.input);
  }

  private handleChange = () => {
    const files = Array.from(this.input.files ?? []);
    // Reset first: without it, choosing the same file twice in a row fires no
    // change event the second time.
    this.input.value = '';
    if (files.length > 0) this.onFiles(files);
  };
}

/** Read one file as a data URL. */
function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read image file: ${file.name}`));
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string | undefined;
      if (dataUrl) resolve(dataUrl);
      else reject(new Error(`Failed to decode image file: ${file.name}`));
    };
    reader.readAsDataURL(file);
  });
}

/** Next free `img_N`, derived from what is already there rather than counted. */
export function nextImageId(existing: readonly ImageItem[]): number {
  return existing.reduce((max, img) => {
    const n = parseInt(img.id.replace('img_', ''), 10);
    return Number.isNaN(n) ? max : Math.max(max, n + 1);
  }, 1);
}

/**
 * Load image files as new {@link ImageItem}s, without touching the project.
 * The caller appends them, so an import that fails part-way leaves the project
 * exactly as it was.
 *
 * Ids are allocated up front, in file order, so the results come back in the
 * order the user picked them even though decoding finishes out of order.
 */
export async function importImageFiles(
  scene: Phaser.Scene,
  files: readonly File[],
  existing: readonly ImageItem[],
): Promise<ImageItem[]> {
  const images = files.filter((f) => f.type.startsWith('image/'));
  if (images.length === 0) throw new Error('Select image files');

  let next = nextImageId(existing);
  const jobs = images.map((file) => {
    const id = `img_${next++}`;
    return { file, id, textureKey: `editor_img_${id}` };
  });

  return Promise.all(jobs.map(async ({ file, id, textureKey }) => {
    const frame = await loadTextureFromDataUrl(scene, textureKey, await readDataUrl(file));
    return { id, fileName: file.name, textureKey, width: frame.realWidth, height: frame.realHeight };
  }));
}

/**
 * Remove images from the project.
 *
 * Three things have to happen together, which is the whole reason this is one
 * function: the records go, every sprite that referenced them stops doing so,
 * and the textures are freed. Skipping the second leaves cards pointing at
 * nothing; skipping the third leaks the texture in Phaser's manager.
 */
export function deleteImages(
  scene: Phaser.Scene,
  data: EditorState,
  ids: readonly string[],
): void {
  if (ids.length === 0) return;
  const doomed = new Set(ids);

  data.images.forEach((img) => {
    if (doomed.has(img.id) && scene.textures.exists(img.textureKey)) {
      scene.textures.remove(img.textureKey);
    }
  });

  data.images = data.images.filter((img) => !doomed.has(img.id));
  data.sprites = data.sprites.map((sprite) => ({
    ...sprite,
    frames: sprite.frames.filter((id) => !doomed.has(id)),
  }));
}
