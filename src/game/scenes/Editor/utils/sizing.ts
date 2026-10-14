import Phaser from 'phaser';

export interface SpriteSourceSize {
  width: number;
  height: number;
}

export interface FittedSize {
  width: number;
  height: number;
}

/**
 * Preserve original size when it already fits; otherwise scale down with
 * aspect-ratio preserved so the full image stays visible (contain behavior).
 */
export function fitContainNoUpscale(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth: number,
  maxHeight: number,
): FittedSize {
  const safeSourceW = Math.max(1, Math.floor(sourceWidth));
  const safeSourceH = Math.max(1, Math.floor(sourceHeight));
  const safeMaxW = Math.max(1, Math.floor(maxWidth));
  const safeMaxH = Math.max(1, Math.floor(maxHeight));

  const scale = Math.min(1, safeMaxW / safeSourceW, safeMaxH / safeSourceH);
  return {
    width: Math.max(1, Math.floor(safeSourceW * scale)),
    height: Math.max(1, Math.floor(safeSourceH * scale)),
  };
}

export function resolveTextureSourceSize(
  scene: Phaser.Scene,
  textureKey: string,
): SpriteSourceSize | null {
  if (!scene.textures.exists(textureKey)) return null;

  const frame = scene.textures.getFrame(textureKey);
  if (!frame) return null;

  const width = Math.max(1, Math.floor(frame.realWidth || frame.width || 0));
  const height = Math.max(1, Math.floor(frame.realHeight || frame.height || 0));
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;

  return { width, height };
}
