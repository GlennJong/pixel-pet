/**
 * Read the shipped config straight off disk. Test-only: it uses node:fs, so
 * nothing in the game may import it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AtlasIndex, AtlasLookup, GameConfigFiles } from './types';

const PUBLIC = join(__dirname, '../../../public');
export const readPublicJson = (rel: string) => JSON.parse(readFileSync(join(PUBLIC, rel), 'utf8'));

export function loadShippedConfig(): GameConfigFiles {
  return {
    character: readPublicJson('configs/pet/character/core.json'),
    conditions: readPublicJson('configs/pet/character/conditions.json'),
    effects: readPublicJson('configs/pet/character/effects.json'),
    autoActions: readPublicJson('configs/pet/character/autoActions.json'),
    stats: readPublicJson('configs/pet/character/stats.json'),
    commands: readPublicJson('configs/system/commands.json'),
    header: readPublicJson('configs/pet/header/core.json'),
    room: readPublicJson('configs/pet/room/core.json'),
    dialogue: readPublicJson('configs/global/dialogue/core.json'),
    locale: readPublicJson('configs/locales/zh-tw.json'),
  };
}

/** Frame names from either atlas layout: a `frames` hash, or a `textures[].frames` array. */
function frameNames(sheet: {
  frames?: Record<string, unknown>;
  textures?: { frames: { filename: string }[] }[];
}): string[] {
  if (sheet.frames) return Object.keys(sheet.frames);
  return (sheet.textures ?? []).flatMap((t) => t.frames.map((f) => f.filename));
}

export function shippedAtlases(): AtlasLookup {
  const { atlases } = readPublicJson('configs/assets.json') as {
    atlases: { atlasId: string; json: string; animations?: string }[];
  };
  const cache = new Map<string, AtlasIndex>();
  return (atlasId) => {
    if (cache.has(atlasId)) return cache.get(atlasId);
    const entry = atlases.find((a) => a.atlasId === atlasId);
    if (!entry) return undefined;
    const animations: { prefix: string }[] = entry.animations ? readPublicJson(entry.animations) : [];
    const index = {
      prefixes: new Set(animations.map((a) => a.prefix)),
      frames: new Set(frameNames(readPublicJson(entry.json))),
    };
    cache.set(atlasId, index);
    return index;
  };
}
