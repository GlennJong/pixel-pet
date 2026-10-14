import Phaser from 'phaser';
import { parseFrameName } from '@/game/assets';
import { ImageItem, SpriteData } from '../types';
import { parseSmartFileName, stripExtension } from './smartInput';
import { isRecord, toInteger } from './json';
import { removeEditorImageTextures } from './texture';

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

interface ParsedAnimation {
  prefix: string;
  qty: number;
  freq: number;
  repeat: number;
  repeatDelay: number;
  frameNames?: string[];
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

  const frameImages = extractFrameImages(input.scene, atlasImage, atlasFrames);
  const frameIdByName = buildFrameIdLookup(frameImages);

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

function extractFrameImages(
  scene: Phaser.Scene,
  atlasImage: HTMLImageElement,
  frames: NormalizedAtlasFrame[],
): FrameImageResult[] {
  // Free any editor textures from a previous import before creating the new
  // set, so re-importing a smaller atlas can't leave higher-indexed textures
  // resident in the (game-global) texture manager.
  removeEditorImageTextures(scene);

  const results: FrameImageResult[] = [];

  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i];
    // One canvas per frame, registered directly with the texture manager. This
    // avoids the PNG encode→decode round-trip (toDataURL + addBase64) the old
    // path did per frame, and is synchronous so no per-frame decode to await.
    const canvas = document.createElement('canvas');
    canvas.width = frame.w;
    canvas.height = frame.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Cannot create canvas context for atlas import.');
    }
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

    const id = `img_${i + 1}`;
    const textureKey = `editor_img_${id}`;
    scene.textures.addCanvas(textureKey, canvas);

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

function parseAnimations(text: string | undefined, warnings: string[]): ParsedAnimation[] {
  if (!text || !text.trim()) return [];

  const raw = safeParseJson(text, 'animations.json');
  if (!Array.isArray(raw)) {
    throw new Error('animations.json must be an array.');
  }

  const animations: ParsedAnimation[] = [];

  raw.forEach((entry, index) => {
    if (!isRecord(entry)) {
      warnings.push(`animations.json[${index}] is not an object and was ignored.`);
      return;
    }

    const prefix = String(entry.prefix ?? entry.key ?? '').trim();
    const frameNames = parseAnimationFrameNames(entry.frames, prefix);

    let qty = toInteger(entry.qty, 0);
    if (qty <= 0 && frameNames.length > 0) {
      qty = frameNames.length;
    }

    if (!prefix || qty <= 0) {
      warnings.push(`animations.json[${index}] has invalid prefix/qty and was ignored.`);
      return;
    }

    const repeat = readRepeat(entry);
    const repeatDelay = Math.max(0, toInteger(entry.repeatDelay ?? entry.repeat_delay, 0));

    animations.push({
      prefix,
      qty,
      freq: Math.max(1, toInteger(entry.freq, 8)),
      repeat,
      repeatDelay,
      frameNames: frameNames.length > 0 ? frameNames : undefined,
    });
  });

  return animations;
}

function buildSpritesFromAnimations(
  animations: ParsedAnimation[],
  frameIdByName: Map<string, string>,
  warnings: string[],
): SpriteData[] {
  const sprites: SpriteData[] = [];

  animations.forEach(anim => {
    const expectedFrameCount = anim.frameNames?.length ?? anim.qty;
    const frameIds = resolveAnimationFrameIds(anim, frameIdByName);

    if (frameIds.length === 0) {
      warnings.push(`Animation prefix "${anim.prefix}" has no matching frames and was ignored.`);
      return;
    }

    if (frameIds.length < expectedFrameCount) {
      warnings.push(
        `Animation prefix "${anim.prefix}" is missing ${expectedFrameCount - frameIds.length} expected frame(s).`,
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

function resolveAnimationFrameIds(
  anim: ParsedAnimation,
  frameIdByName: Map<string, string>,
): string[] {
  const frameIds: string[] = [];

  if (anim.frameNames && anim.frameNames.length > 0) {
    anim.frameNames.forEach(frameName => {
      const frameId = findFrameId(frameIdByName, frameName);
      if (frameId) {
        frameIds.push(frameId);
      }
    });
    return frameIds;
  }

  const hasZero = findFrameId(frameIdByName, `${anim.prefix}_0`) !== undefined;
  const hasOne = findFrameId(frameIdByName, `${anim.prefix}_1`) !== undefined;
  const startIndex = hasZero && !hasOne ? 0 : 1;

  for (let offset = 0; offset < anim.qty; offset += 1) {
    const frameName = `${anim.prefix}_${startIndex + offset}`;
    const frameId = findFrameId(frameIdByName, frameName);
    if (frameId) {
      frameIds.push(frameId);
    }
  }

  return frameIds;
}

function buildFrameIdLookup(frameImages: FrameImageResult[]): Map<string, string> {
  const lookup = new Map<string, string>();

  frameImages.forEach(entry => {
    const frameId = entry.image.id;
    const frameName = entry.frameName;
    const baseName = getBaseName(frameName);

    lookup.set(frameName, frameId);
    lookup.set(stripExtension(frameName), frameId);
    lookup.set(baseName, frameId);
    lookup.set(stripExtension(baseName), frameId);
  });

  return lookup;
}

function findFrameId(lookup: Map<string, string>, rawName: string): string | undefined {
  const name = rawName.trim();
  if (!name) return undefined;

  const direct = lookup.get(name);
  if (direct) return direct;

  const noExt = stripExtension(name);
  const byNoExt = lookup.get(noExt);
  if (byNoExt) return byNoExt;

  const base = getBaseName(name);
  const byBase = lookup.get(base);
  if (byBase) return byBase;

  const byBaseNoExt = lookup.get(stripExtension(base));
  if (byBaseNoExt) return byBaseNoExt;

  return undefined;
}

function parseAnimationFrameNames(value: unknown, prefix: string): string[] {
  if (!Array.isArray(value)) return [];

  const frameNames: string[] = [];
  value.forEach(item => {
    const parsed = parseAnimationFrameNameItem(item, prefix);
    if (parsed) frameNames.push(parsed);
  });

  return frameNames;
}

function parseAnimationFrameNameItem(item: unknown, prefix: string): string | null {
  if (typeof item === 'number' && Number.isFinite(item)) {
    return `${prefix}_${Math.trunc(item)}`;
  }

  if (typeof item === 'string') {
    const trimmed = item.trim();
    return trimmed || null;
  }

  if (!isRecord(item)) return null;

  const frameValue = item.frame ?? item.key ?? item.filename ?? item.name;
  if (typeof frameValue === 'number' && Number.isFinite(frameValue)) {
    return `${prefix}_${Math.trunc(frameValue)}`;
  }

  if (typeof frameValue === 'string') {
    const trimmed = frameValue.trim();
    return trimmed || null;
  }

  return null;
}

function readRepeat(entry: Record<string, unknown>): number {
  if (typeof entry.repeat === 'number' || typeof entry.repeat === 'string') {
    return toInteger(entry.repeat, -1);
  }

  if (typeof entry.loop === 'boolean') {
    return entry.loop ? -1 : 0;
  }

  if (typeof entry.loops === 'number' || typeof entry.loops === 'string') {
    return toInteger(entry.loops, -1);
  }

  return -1;
}

function getBaseName(name: string): string {
  const segments = name.split(/[\\/]/);
  return segments[segments.length - 1] || name;
}

function buildFallbackSprites(frameImages: FrameImageResult[]): SpriteData[] {
  const groups = new Map<string, Array<{ frameId: string; order: number; frameName: string }>>();

  frameImages.forEach((entry, index) => {
    const parsed = parseFrameName(entry.frameName);
    const prefix = parsed?.prefix || entry.frameName;
    const order = parsed ? parsed.index : index;

    const existing = groups.get(prefix);
    if (existing) {
      existing.push({ frameId: entry.image.id, order, frameName: entry.frameName });
      return;
    }

    groups.set(prefix, [{ frameId: entry.image.id, order, frameName: entry.frameName }]);
  });

  return Array.from(groups.entries()).map(([prefix, items], index) => {
    // items is locally owned and not reused after mapping — sort in place.
    const sortedItems = items.sort((a, b) => {
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
  animations: ParsedAnimation[],
  frameNames: string[],
): string {
  const hint = projectNameHint?.trim();
  if (hint) return hint;

  const animationPrefix = animations[0]?.prefix?.trim();
  if (animationPrefix) return deriveProjectKey(`${animationPrefix}_0.png`, animationPrefix);

  const firstFrameName = frameNames[0]?.trim();
  if (firstFrameName) return deriveProjectKey(`${firstFrameName}.png`, firstFrameName);

  return 'project';
}

/**
 * Derive a project key from a candidate filename: prefer the smart-parsed key,
 * else the first underscore token, else the raw fallback.
 */
function deriveProjectKey(candidateFileName: string, rawFallback: string): string {
  const parsed = parseSmartFileName(candidateFileName);
  if (parsed) return parsed.key;

  const firstToken = rawFallback.split('_')[0]?.trim();
  if (firstToken) return firstToken;

  return rawFallback;
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

