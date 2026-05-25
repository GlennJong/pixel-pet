import { ImageItem, SpriteData } from '../types';

interface ParsedFileName {
  key: string;
  sprite: string;
  order: number;
}

interface GroupedFrame {
  image: ImageItem;
  order: number;
}

export interface SmartInputPresetResult {
  sprites: SpriteData[];
  parsedImageCount: number;
  skippedImageCount: number;
  detectedKeys: string[];
}

/**
 * Parse file names like "currycat_idle_0.png" into key/sprite/order,
 * then build initial SpriteData groups for SpriteEditScreen.
 */
export function buildPresetSpritesFromImages(images: ImageItem[]): SmartInputPresetResult {
  const parsedEntries = images
    .map(img => ({ image: img, parsed: parseSmartFileName(img.fileName) }))
    .filter((entry): entry is { image: ImageItem; parsed: ParsedFileName } => entry.parsed !== null);

  const parsedImageCount = parsedEntries.length;
  const skippedImageCount = Math.max(0, images.length - parsedImageCount);

  const keySet = new Set(parsedEntries.map(entry => entry.parsed.key));
  const detectedKeys = Array.from(keySet);
  const includeKeyInPrefix = detectedKeys.length > 1;

  const groups = new Map<string, { prefix: string; frames: GroupedFrame[] }>();

  parsedEntries.forEach(entry => {
    const { parsed, image } = entry;
    const prefix = includeKeyInPrefix ? `${parsed.key}_${parsed.sprite}` : parsed.sprite;
    const groupKey = `${parsed.key}__${parsed.sprite}`;
    const group = groups.get(groupKey);

    if (!group) {
      groups.set(groupKey, {
        prefix,
        frames: [{ image, order: parsed.order }],
      });
      return;
    }

    group.frames.push({ image, order: parsed.order });
  });

  let idCounter = 1;
  const sprites: SpriteData[] = Array.from(groups.values()).map(group => {
    const sortedFrames = [...group.frames].sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.image.fileName.localeCompare(b.image.fileName);
    });

    return {
      id: `smart_sprite_${idCounter++}`,
      prefix: group.prefix,
      frames: sortedFrames.map(f => f.image.id),
      freq: 8,
      repeat: -1,
      repeatDelay: 0,
    };
  });

  return {
    sprites,
    parsedImageCount,
    skippedImageCount,
    detectedKeys,
  };
}

/**
 * Expected format: <key>_<sprite>_<order>.<ext>
 * Example: currycat_idle_0.png
 */
export function parseSmartFileName(fileName: string): ParsedFileName | null {
  const baseName = fileName.replace(/\.[^.]+$/, '');
  // Treat repeated underscores as a single separator so users don't need
  // to distinguish between single/double underscores when naming files.
  const normalizedBaseName = baseName.replace(/_+/g, '_');
  const match = /^([^_]+)_(.+)_(\d+)$/.exec(normalizedBaseName);
  if (!match) return null;

  const key = match[1].trim();
  const sprite = match[2].trim();
  const order = Number.parseInt(match[3], 10);

  if (!key || !sprite || Number.isNaN(order)) return null;

  return {
    key,
    sprite,
    order,
  };
}
