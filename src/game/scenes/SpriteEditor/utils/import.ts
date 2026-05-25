import Phaser from 'phaser';
import { AnimationItem, ImageItem, SpriteData } from '../types';
import { parseSmartFileName } from './smartInput';

interface NormalizedAtlasFrame {
  frameName: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface FrameImageResult {
  image: ImageItem;
  frameName: string;
}

export interface ImportAtlasTrioInput {
  scene: Phaser.Scene;
  pngBlob: Blob;
  spritesheetJsonText: string;
  animationsJsonText?: string;
  projectNameHint?: string;
}

export interface ImportAtlasTrioResult {
  projectName: string;
  images: ImageItem[];
  sprites: SpriteData[];
  warnings: string[];
}

export async function importAtlasTrio(input: ImportAtlasTrioInput): Promise<ImportAtlasTrioResult> {
  const warnings: string[] = [];

  const rawSpritesheet = safeParseJson(input.spritesheetJsonText, 'spritesheet.json');
  const atlasFrames = normalizeAtlasFrames(rawSpritesheet);
  if (atlasFrames.length === 0) {
    throw new Error('spritesheet.json has no readable frames.');
  }

  const atlasImage = await loadImageFromBlob(input.pngBlob);
  validateFrameBounds(atlasFrames, atlasImage.width, atlasImage.height);

  const frameImages = await extractFrameImages(input.scene, atlasImage, atlasFrames);
  const frameIdByName = new Map(frameImages.map(entry => [entry.frameName, entry.image.id]));

  const animations = parseAnimations(input.animationsJsonText, warnings);
  let sprites = buildSpritesFromAnimations(animations, frameIdByName, warnings);
  if (sprites.length === 0) {
    sprites = buildFallbackSprites(frameImages);
  }

  const projectName = inferProjectName(
    input.projectNameHint,
    animations,
    atlasFrames.map(frame => frame.frameName),
  );

  return {
    projectName,
    images: frameImages.map(entry => entry.image),
    sprites,
    warnings,
  };
}

function normalizeAtlasFrames(raw: unknown): NormalizedAtlasFrame[] {
  if (!isRecord(raw)) {
    throw new Error('spritesheet.json must be a JSON object.');
  }

  const maybeHashFrames = raw.frames;
  if (isRecord(maybeHashFrames) && !Array.isArray(maybeHashFrames)) {
    return Object.entries(maybeHashFrames).map(([frameName, frameValue]) => {
      if (!isRecord(frameValue)) {
        throw new Error(`Invalid frame entry for "${frameName}".`);
      }
      const rect = readFrameRect(frameValue.frame);
      if (!rect) {
        throw new Error(`Missing frame rectangle for "${frameName}".`);
      }
      return {
        frameName,
        ...rect,
      };
    });
  }

  const maybeTextureArray = raw.textures;
  if (Array.isArray(maybeTextureArray) && maybeTextureArray.length > 0) {
    if (maybeTextureArray.length > 1) {
      throw new Error('spritesheet.json uses multiple texture pages, which is not supported yet.');
    }

    const texturePage = maybeTextureArray[0];
    if (!isRecord(texturePage) || !Array.isArray(texturePage.frames)) {
      throw new Error('Invalid texture-page format in spritesheet.json.');
    }

    return texturePage.frames.map((frameEntry, index) => {
      if (!isRecord(frameEntry)) {
        throw new Error(`Invalid texture-page frame entry at index ${index}.`);
      }
      const frameNameRaw = frameEntry.filename;
      const frameName = typeof frameNameRaw === 'string' ? frameNameRaw.trim() : '';
      if (!frameName) {
        throw new Error(`Texture-page frame at index ${index} has no filename.`);
      }
      const rect = readFrameRect(frameEntry.frame);
      if (!rect) {
        throw new Error(`Missing frame rectangle for "${frameName}".`);
      }
      return {
        frameName,
        ...rect,
      };
    });
  }

  throw new Error('Unsupported spritesheet.json format.');
}

function readFrameRect(value: unknown): { x: number; y: number; w: number; h: number } | null {
  if (!isRecord(value)) return null;

  const x = toInteger(value.x, Number.NaN);
  const y = toInteger(value.y, Number.NaN);
  const w = toInteger(value.w, Number.NaN);
  const h = toInteger(value.h, Number.NaN);

  if ([x, y, w, h].some(Number.isNaN)) return null;
  if (w <= 0 || h <= 0) return null;

  return { x, y, w, h };
}

function validateFrameBounds(frames: NormalizedAtlasFrame[], atlasWidth: number, atlasHeight: number) {
  const invalid = frames.find(frame => (
    frame.x < 0
    || frame.y < 0
    || frame.w <= 0
    || frame.h <= 0
    || frame.x + frame.w > atlasWidth
    || frame.y + frame.h > atlasHeight
  ));

  if (invalid) {
    throw new Error(
      `Frame "${invalid.frameName}" is out of bounds for atlas size ${atlasWidth}x${atlasHeight}.`,
    );
  }
}

async function extractFrameImages(
  scene: Phaser.Scene,
  atlasImage: HTMLImageElement,
  frames: NormalizedAtlasFrame[],
): Promise<FrameImageResult[]> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Cannot create canvas context for atlas import.');
  }

  const results: FrameImageResult[] = [];

  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i];
    canvas.width = frame.w;
    canvas.height = frame.h;
    ctx.clearRect(0, 0, frame.w, frame.h);
    ctx.drawImage(
      atlasImage,
      frame.x,
      frame.y,
      frame.w,
      frame.h,
      0,
      0,
      frame.w,
      frame.h,
    );

    const dataUrl = canvas.toDataURL('image/png');
    const id = `img_${i + 1}`;
    const textureKey = `editor_img_${id}`;

    if (scene.textures.exists(textureKey)) {
      scene.textures.remove(textureKey);
    }

    await addTextureFromDataUrl(scene, textureKey, dataUrl);

    results.push({
      frameName: frame.frameName,
      image: {
        id,
        fileName: `${frame.frameName}.png`,
        textureKey,
        width: frame.w,
        height: frame.h,
      },
    });
  }

  return results;
}

function addTextureFromDataUrl(scene: Phaser.Scene, textureKey: string, dataUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const eventName = `addtexture-${textureKey}`;
    const timer = setTimeout(() => {
      scene.textures.off(eventName, onAdded);
      reject(new Error(`Timed out while adding texture "${textureKey}".`));
    }, 5000);

    const onAdded = () => {
      clearTimeout(timer);
      resolve();
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

function parseAnimations(text: string | undefined, warnings: string[]): AnimationItem[] {
  if (!text || !text.trim()) return [];

  const raw = safeParseJson(text, 'animations.json');
  if (!Array.isArray(raw)) {
    throw new Error('animations.json must be an array.');
  }

  const animations: AnimationItem[] = [];

  raw.forEach((entry, index) => {
    if (!isRecord(entry)) {
      warnings.push(`animations.json[${index}] is not an object and was ignored.`);
      return;
    }

    const prefix = String(entry.prefix ?? '').trim();
    const qty = toInteger(entry.qty, 0);
    if (!prefix || qty <= 0) {
      warnings.push(`animations.json[${index}] has invalid prefix/qty and was ignored.`);
      return;
    }

    animations.push({
      id: `import_anim_${animations.length + 1}`,
      prefix,
      qty,
      freq: Math.max(1, toInteger(entry.freq, 8)),
      repeat: toInteger(entry.repeat, -1),
      repeatDelay: Math.max(0, toInteger(entry.repeatDelay, 0)),
    });
  });

  return animations;
}

function buildSpritesFromAnimations(
  animations: AnimationItem[],
  frameIdByName: Map<string, string>,
  warnings: string[],
): SpriteData[] {
  const sprites: SpriteData[] = [];

  animations.forEach(anim => {
    const hasZero = frameIdByName.has(`${anim.prefix}_0`);
    const hasOne = frameIdByName.has(`${anim.prefix}_1`);
    const startIndex = hasZero && !hasOne ? 0 : 1;

    const frameIds: string[] = [];
    for (let offset = 0; offset < anim.qty; offset += 1) {
      const frameName = `${anim.prefix}_${startIndex + offset}`;
      const frameId = frameIdByName.get(frameName);
      if (frameId) {
        frameIds.push(frameId);
      }
    }

    if (frameIds.length === 0) {
      warnings.push(`Animation prefix "${anim.prefix}" has no matching frames and was ignored.`);
      return;
    }

    if (frameIds.length < anim.qty) {
      warnings.push(
        `Animation prefix "${anim.prefix}" is missing ${anim.qty - frameIds.length} expected frame(s).`,
      );
    }

    sprites.push({
      id: `imported_sprite_${sprites.length + 1}`,
      prefix: anim.prefix,
      frames: frameIds,
      freq: Math.max(1, anim.freq),
      repeat: anim.repeat,
      repeatDelay: Math.max(0, anim.repeatDelay),
    });
  });

  return sprites;
}

function buildFallbackSprites(frameImages: FrameImageResult[]): SpriteData[] {
  const groups = new Map<string, Array<{ frameId: string; order: number; frameName: string }>>();

  frameImages.forEach((entry, index) => {
    const match = /^(.*)_(\d+)$/.exec(entry.frameName);
    const prefix = match && match[1] ? match[1] : entry.frameName;
    const order = match ? Number.parseInt(match[2], 10) : index;

    const existing = groups.get(prefix);
    if (existing) {
      existing.push({ frameId: entry.image.id, order, frameName: entry.frameName });
      return;
    }

    groups.set(prefix, [{ frameId: entry.image.id, order, frameName: entry.frameName }]);
  });

  return Array.from(groups.entries()).map(([prefix, items], index) => {
    const sortedItems = [...items].sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.frameName.localeCompare(b.frameName);
    });

    return {
      id: `imported_sprite_${index + 1}`,
      prefix,
      frames: sortedItems.map(item => item.frameId),
      freq: 8,
      repeat: -1,
      repeatDelay: 0,
    };
  });
}

function inferProjectName(
  projectNameHint: string | undefined,
  animations: AnimationItem[],
  frameNames: string[],
): string {
  const hint = projectNameHint?.trim();
  if (hint) return hint;

  const animationPrefix = animations[0]?.prefix?.trim();
  if (animationPrefix) {
    const parsedPrefix = parseSmartFileName(`${animationPrefix}_0.png`);
    if (parsedPrefix) {
      return parsedPrefix.key;
    }

    const firstToken = animationPrefix.split('_')[0]?.trim();
    if (firstToken) {
      return firstToken;
    }

    return animationPrefix;
  }

  const firstFrameName = frameNames[0]?.trim();
  if (firstFrameName) {
    const parsedFrame = parseSmartFileName(`${firstFrameName}.png`);
    if (parsedFrame) {
      return parsedFrame.key;
    }

    const firstToken = firstFrameName.split('_')[0]?.trim();
    if (firstToken) {
      return firstToken;
    }

    return firstFrameName;
  }

  return 'project';
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to decode spritesheet.png.'));
    };

    image.src = objectUrl;
  });
}

function safeParseJson(text: string, fileLabel: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(
      `${fileLabel} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function toInteger(value: unknown, fallback: number): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.trunc(numberValue);
}
