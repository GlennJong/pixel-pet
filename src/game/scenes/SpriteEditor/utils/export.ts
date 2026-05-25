import Phaser from 'phaser';
import { AnimationItem, EditorState, ImageItem, SpriteData } from '../types';

interface FrameInput {
  frameName: string;
  image: ImageItem;
}

interface PackedFrame extends FrameInput {
  x: number;
  y: number;
}

interface SpritesheetFrameData {
  frame: { x: number; y: number; w: number; h: number };
  rotated: false;
  trimmed: false;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
}

interface SpritesheetJsonData {
  frames: Record<string, SpritesheetFrameData>;
  meta: {
    app: string;
    version: string;
    image: string;
    format: string;
    size: { w: number; h: number };
    scale: string;
  };
}

export interface SpriteEditorExportArtifacts {
  spritesheetPng: Blob;
  spritesheetJson: SpritesheetJsonData;
  spritesheetJsonText: string;
  animations: AnimationItem[];
  animationsJsonText: string;
  renamedPrefixes: Array<{ from: string; to: string }>;
}

/**
 * Build export artifacts in the same shape as existing atlas assets:
 * - spritesheet.png
 * - spritesheet.json (TexturePacker hash style)
 * - animations.json
 */
export async function buildSpriteEditorExport(
  scene: Phaser.Scene,
  state: EditorState,
): Promise<SpriteEditorExportArtifacts> {
  const normalized = normalizeSpritePrefixes(state.sprites);
  const imageById = new Map(state.images.map(img => [img.id, img]));

  const frameInputs: FrameInput[] = [];
  const animations: AnimationItem[] = [];

  normalized.sprites.forEach(sprite => {
    const frames = sprite.frames
      .map(frameId => imageById.get(frameId))
      .filter((img): img is ImageItem => !!img);

    if (frames.length === 0) return;

    frames.forEach((img, idx) => {
      frameInputs.push({
        frameName: `${sprite.prefix}_${idx + 1}`,
        image: img,
      });
    });

    const animation: AnimationItem = {
      prefix: sprite.prefix,
      qty: frames.length,
      freq: Math.max(1, Math.floor(sprite.freq)),
      repeat: Math.floor(sprite.repeat),
    };
    if (sprite.repeatDelay > 0) animation.repeatDelay = Math.floor(sprite.repeatDelay);
    animations.push(animation);
  });

  if (frameInputs.length === 0) {
    throw new Error('No frames available for export. Assign frames to at least one sprite.');
  }

  const packed = packFrames(frameInputs);
  const pngBlob = await renderAtlasToPng(scene, packed.frames, packed.width, packed.height);
  const spritesheetJson = buildSpritesheetJson(packed.frames, packed.width, packed.height);

  return {
    spritesheetPng: pngBlob,
    spritesheetJson,
    spritesheetJsonText: JSON.stringify(spritesheetJson, null, 2),
    animations,
    animationsJsonText: JSON.stringify(animations, null, 2),
    renamedPrefixes: normalized.renamed,
  };
}

export function downloadSpriteEditorExport(artifacts: SpriteEditorExportArtifacts) {
  downloadBlob('spritesheet.png', artifacts.spritesheetPng);
  downloadBlob(
    'spritesheet.json',
    new Blob([artifacts.spritesheetJsonText], { type: 'application/json' }),
  );
  downloadBlob(
    'animations.json',
    new Blob([artifacts.animationsJsonText], { type: 'application/json' }),
  );
}

function buildSpritesheetJson(
  frames: PackedFrame[],
  width: number,
  height: number,
): SpritesheetJsonData {
  const frameData: Record<string, SpritesheetFrameData> = {};

  frames.forEach(item => {
    frameData[item.frameName] = {
      frame: { x: item.x, y: item.y, w: item.image.width, h: item.image.height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: item.image.width, h: item.image.height },
      sourceSize: { w: item.image.width, h: item.image.height },
    };
  });

  return {
    frames: frameData,
    meta: {
      app: 'http://www.codeandweb.com/texturepacker',
      version: '1.0',
      image: 'spritesheet.png',
      format: 'RGBA8888',
      size: { w: width, h: height },
      scale: '1',
    },
  };
}

function packFrames(input: FrameInput[]) {
  const totalArea = input.reduce((sum, f) => sum + f.image.width * f.image.height, 0);
  const maxFrameW = input.reduce((max, f) => Math.max(max, f.image.width), 0);
  const targetWidth = Math.max(maxFrameW, Math.ceil(Math.sqrt(totalArea)));

  const frames: PackedFrame[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  let atlasW = 0;
  let atlasH = 0;

  input.forEach(item => {
    const w = item.image.width;
    const h = item.image.height;

    if (x > 0 && x + w > targetWidth) {
      x = 0;
      y += rowH;
      rowH = 0;
    }

    frames.push({
      ...item,
      x,
      y,
    });

    x += w;
    rowH = Math.max(rowH, h);
    atlasW = Math.max(atlasW, x);
    atlasH = Math.max(atlasH, y + rowH);
  });

  return {
    frames,
    width: Math.max(1, atlasW),
    height: Math.max(1, atlasH),
  };
}

async function renderAtlasToPng(
  scene: Phaser.Scene,
  packedFrames: PackedFrame[],
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create canvas context for export.');
  ctx.imageSmoothingEnabled = false;

  for (const packed of packedFrames) {
    const texture = scene.textures.get(packed.image.textureKey);
    if (!texture) {
      throw new Error(`Texture not found for export: ${packed.image.textureKey}`);
    }

    const source = texture.getSourceImage();
    const sourceImage = Array.isArray(source) ? source[0] : source;
    if (!sourceImage) {
      throw new Error(`Texture source not found for export: ${packed.image.textureKey}`);
    }

    ctx.drawImage(
      sourceImage as CanvasImageSource,
      packed.x,
      packed.y,
      packed.image.width,
      packed.image.height,
    );
  }

  return canvasToBlob(canvas);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('Failed to generate PNG from canvas.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function normalizeSpritePrefixes(sprites: SpriteData[]) {
  const normalized = sprites.map((sp, i) => ({
    ...sp,
    prefix: (sp.prefix || '').trim() || `sprite_${i + 1}`,
  }));

  const grouped = new Map<string, number[]>();
  normalized.forEach((sp, idx) => {
    const arr = grouped.get(sp.prefix) || [];
    arr.push(idx);
    grouped.set(sp.prefix, arr);
  });

  const used = new Set<string>();
  const renamed: Array<{ from: string; to: string }> = [];

  const ensureUnique = (candidate: string) => {
    let out = candidate;
    let n = 1;
    while (used.has(out)) {
      n += 1;
      out = `${candidate}(${n})`;
    }
    used.add(out);
    return out;
  };

  grouped.forEach((indices, base) => {
    if (indices.length === 1) {
      const idx = indices[0];
      const unique = ensureUnique(base);
      if (unique !== base) {
        renamed.push({ from: base, to: unique });
      }
      normalized[idx] = { ...normalized[idx], prefix: unique };
      return;
    }

    indices.forEach((idx, i) => {
      const renamedPrefix = ensureUnique(`${base}(${i + 1})`);
      renamed.push({ from: base, to: renamedPrefix });
      normalized[idx] = { ...normalized[idx], prefix: renamedPrefix };
    });
  });

  return {
    sprites: normalized,
    renamed,
  };
}
