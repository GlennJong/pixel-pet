import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  AnimationItem, AtlasEntry,
  animationKey, atlasIdFromPath, frameName, isValidPrefix, parseFrameName,
  validateAnimations, validateAtlasEntry, validateFrameNames,
} from './contract';

describe('naming rules', () => {
  it('round-trips a frame name', () => {
    expect(frameName('walk-left', 1)).toBe('walk-left_1');
    expect(parseFrameName('walk-left_1')).toEqual({ prefix: 'walk-left', index: 1 });
  });

  it('keeps prefixes that end in digits unambiguous', () => {
    // '_' is reserved for the index, so a trailing digit in the prefix is safe.
    expect(parseFrameName('back-0_1')).toEqual({ prefix: 'back-0', index: 1 });
    expect(parseFrameName('hp-100_1')).toEqual({ prefix: 'hp-100', index: 1 });
  });

  it('rejects names without an index', () => {
    expect(parseFrameName('frame')).toBeNull();
    expect(parseFrameName('hp-empty')).toBeNull();
  });

  it('rejects prefixes that would break the split', () => {
    expect(isValidPrefix('walk-left')).toBe(true);
    expect(isValidPrefix('hp-100')).toBe(true);
    expect(isValidPrefix('walk_left')).toBe(false);  // '_' belongs to the index
    expect(isValidPrefix('walk-left(2)')).toBe(false); // the game could never call it
    expect(isValidPrefix('1')).toBe(false);          // a bare number is not an identifier
    expect(isValidPrefix('')).toBe(false);
  });

  it('builds the key Phaser registers an animation under', () => {
    expect(animationKey('pet_character_afk', 'walk-left')).toBe('pet_character_afk_walk-left');
  });

  it('derives an atlasId from its path, and declines to for an overlay', () => {
    expect(atlasIdFromPath('assets/sprites/pet/character/afk/spritesheet.png'))
      .toBe('pet_character_afk');
    expect(atlasIdFromPath('data:image/png;base64,AAAA')).toBeNull();
  });
});

describe('validators', () => {
  it('flags an atlasId that disagrees with its path', () => {
    const bad: AtlasEntry = {
      atlasId: 'pet_character_typo',
      png: 'assets/sprites/pet/character/afk/spritesheet.png',
      json: 'x.json',
    };
    expect(validateAtlasEntry(bad)).toHaveLength(1);
  });

  it('flags an illegal prefix', () => {
    const anims = [{ prefix: 'walk_left', qty: 1, freq: 1, repeat: 0 }] as AnimationItem[];
    expect(validateAnimations('a', anims)).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The convention only holds because every shipped asset follows it. These check
// the real files, so breaking the rule fails here instead of silently producing
// an atlas the game cannot address.
//
// Scope is the atlases registered in assets.json — an unregistered directory is
// not part of the contract.
// ─────────────────────────────────────────────────────────────────────────────

const root = process.cwd();
const readJson = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf-8'));

function frameNamesOf(sheet: any): string[] {
  if (sheet.frames && !Array.isArray(sheet.frames)) return Object.keys(sheet.frames);
  return (sheet.textures ?? []).flatMap((t: any) => (t.frames ?? []).map((f: any) => f.filename));
}

const registered: AtlasEntry[] = readJson('public/configs/assets.json').atlases;

describe('shipped assets obey the contract', () => {
  it('registers at least one atlas', () => {
    expect(registered.length).toBeGreaterThan(0);
  });

  it.each(registered.map((a) => [a.atlasId, a] as const))('%s', (_id, entry) => {
    expect(validateAtlasEntry(entry)).toEqual([]);

    const sheetPath = join('public', entry.json);
    if (existsSync(join(root, sheetPath))) {
      expect(validateFrameNames(entry.atlasId, frameNamesOf(readJson(sheetPath)))).toEqual([]);
    }

    if (entry.animations) {
      const animPath = join('public', entry.animations);
      if (existsSync(join(root, animPath))) {
        expect(validateAnimations(entry.atlasId, readJson(animPath))).toEqual([]);
      }
    }
  });

  it('only whitelists atlases that are pure animation sequences', () => {
    const editable = registered.filter((a) => a.editable).map((a) => a.atlasId);
    // ui_frame holds the shared nineslice, whose insets live in config;
    // sprite_editor is the editor's own chrome. Everything on this list is a
    // plain set of named animation sequences. See D1/D7/D10 in
    // docs/SpriteEditor Scope.md.
    // Membership, not order — the order in assets.json is the editor's pick-list
    // order, which is free to change without touching the whitelist.
    expect([...editable].sort()).toEqual([
      'pet_character_afk',
      'pet_environment_my_room',
      'pet_ui_header_cute_01',
    ]);
  });

  it('leaves no frame of an editable atlas outside its animations.json', () => {
    // The editor builds its slot grid from animations.json and rebuilds the
    // whole atlas on APPLY, so a frame no animation declares is not merely
    // invisible in the editor — it is deleted by the first save. That is how
    // the header's `frame_1` / `hp-empty_1` would have broken the window frame
    // and the empty-HP icon. Non-editable atlases are exempt: nothing rebuilds
    // them, so they may hold whatever a config addresses directly.
    registered
      .filter((a) => a.editable && a.animations)
      .forEach((entry) => {
        const sheetPath = join('public', entry.json);
        const animPath = join('public', entry.animations!);
        if (!existsSync(join(root, sheetPath)) || !existsSync(join(root, animPath))) return;

        const declared = new Set(
          (readJson(animPath) as AnimationItem[]).map((a) => a.prefix),
        );
        const orphans = frameNamesOf(readJson(sheetPath)).filter(
          (name) => !declared.has(parseFrameName(name)?.prefix ?? name),
        );
        expect(orphans, `${entry.atlasId} has frames no animation declares`).toEqual([]);
      });
  });

  it('gives every editable atlas a display name', () => {
    // The pick list shows the user a name; an atlasId is an identifier that
    // happens to be readable, not a label. Any atlas opened up for editing needs
    // one, so a missing displayName is a mistake rather than a default.
    registered
      .filter((a) => a.editable)
      .forEach((a) => expect(a.displayName, `${a.atlasId} has no displayName`).toBeTruthy());
  });
});
