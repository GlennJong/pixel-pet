import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildSlotTemplate,
  parseEditableAtlasList,
  pickDefaultAtlas,
  reconcileSlots,
  templateToAnimations,
} from './template';

const readJson = (p: string) => JSON.parse(readFileSync(join(process.cwd(), p), 'utf-8'));

describe('buildSlotTemplate', () => {
  it('carries the shipped qty / freq / repeat through as slot defaults', () => {
    const t = buildSlotTemplate('a', [
      { prefix: 'walk-left', qty: 6, freq: 8, repeat: 4 },
      { prefix: 'drink', qty: 7, freq: 4, repeat: 0, repeatDelay: 1000 },
    ]);
    expect(t.warnings).toEqual([]);
    expect(t.slots[0]).toEqual({ prefix: 'walk-left', qty: 6, freq: 8, repeat: 4 });
    expect(t.slots[1].repeatDelay).toBe(1000);
  });

  it('keeps `duration`, which the editor used to drop on every round-trip', () => {
    const t = buildSlotTemplate('a', [{ prefix: 'x', qty: 1, freq: 1, repeat: 0, duration: 500 }]);
    expect(t.slots[0].duration).toBe(500);
  });

  it('warns rather than throws on bad factory data', () => {
    const t = buildSlotTemplate('a', [
      { prefix: 'ok', qty: 1, freq: 1, repeat: 0 },
      { prefix: 'bad_name', qty: 1, freq: 1, repeat: 0 },
      { qty: 1 },
      { prefix: 'ok', qty: 2, freq: 1, repeat: 0 },
    ]);
    expect(t.slots.map((s) => s.prefix)).toEqual(['ok', 'bad_name']);
    expect(t.warnings).toHaveLength(3); // illegal prefix, missing prefix, duplicate
  });

  it('returns an empty template for a non-array', () => {
    expect(buildSlotTemplate('a', { nope: true }).slots).toEqual([]);
  });
});

describe('reconcileSlots — "which animations actually take effect"', () => {
  const template = buildSlotTemplate('a', [
    { prefix: 'walk-left', qty: 6, freq: 8, repeat: 4 },
    { prefix: 'idle-left', qty: 2, freq: 1, repeat: 1 },
    { prefix: 'sleep', qty: 5, freq: 2, repeat: 0 },
  ]);

  it('reports filled, missing and extra', () => {
    const r = reconcileSlots(template, [
      { prefix: 'walk-left', frames: ['a', 'b'] },
      { prefix: 'sleep', frames: [] },
      { prefix: 'dance', frames: ['z'] },
    ]);
    expect(r.filled.map((f) => f.slot.prefix)).toEqual(['walk-left', 'sleep']);
    expect(r.missing.map((s) => s.prefix)).toEqual(['idle-left']);
    expect(r.extra.map((e) => e.prefix)).toEqual(['dance']);
  });

  it('keeps template order regardless of the edit order', () => {
    const r = reconcileSlots(template, [
      { prefix: 'sleep' }, { prefix: 'idle-left' }, { prefix: 'walk-left' },
    ]);
    expect(r.filled.map((f) => f.slot.prefix)).toEqual(['walk-left', 'idle-left', 'sleep']);
  });

  it('never silently drops an unmatched entry', () => {
    const r = reconcileSlots(template, [{ prefix: 'face-angry' }]);
    expect(r.extra).toHaveLength(1);
    expect(r.filled).toHaveLength(0);
  });
});

describe('against the real factory assets', () => {
  it('templates the character into its 18 shipped slots', () => {
    const t = buildSlotTemplate(
      'pet_character_afk',
      readJson('public/assets/sprites/pet/character/afk/animations.json'),
    );
    expect(t.warnings).toEqual([]);
    expect(t.slots).toHaveLength(18);
    expect(t.slots.map((s) => s.prefix)).toContain('walk-left');
    // The three portrait animations the config reaches through `portrait`, not
    // `animationSet` — reading the config instead of the atlas would miss them.
    expect(t.slots.map((s) => s.prefix)).toEqual(
      expect.arrayContaining(['face-normal', 'face-angry', 'face-sad']),
    );
    expect(t.slots.find((s) => s.prefix === 'walk-left')).toMatchObject({ qty: 6, freq: 8 });
  });

  it('templates the room, which uses the same model as the character', () => {
    const t = buildSlotTemplate(
      'pet_environment_my_room',
      readJson('public/assets/sprites/pet/environment/my_room/animations.json'),
    );
    expect(t.warnings).toEqual([]);
    expect(t.slots).toHaveLength(9);
  });

  it('round-trips a template back into animations.json shape', () => {
    const raw = readJson('public/assets/sprites/pet/character/afk/animations.json');
    expect(templateToAnimations(buildSlotTemplate('x', raw))).toEqual(raw);
  });
});

describe('parseEditableAtlasList', () => {
  const entry = (over: Record<string, unknown> = {}) => ({
    atlasId: 'pet_character_afk',
    displayName: 'PET CHARACTER',
    description: 'Pet poses and expressions',
    png: 'sprites/pet/character/afk.png',
    json: 'sprites/pet/character/afk.json',
    animations: 'configs/pet/character/afk-animations.json',
    editable: true,
    ...over,
  });

  it('keeps only atlases that opt in with editable: true', () => {
    const list = parseEditableAtlasList({
      atlases: [
        entry(),
        entry({ atlasId: 'ui_frame', editable: false }),
        entry({ atlasId: 'ui_icon', editable: undefined }), // no opt-in at all
      ],
    });
    expect(list.map((a) => a.atlasId)).toEqual(['pet_character_afk']);
  });

  it('carries the pick list\'s display fields through', () => {
    // The parser rebuilds the entry field by field, so anything it forgets to
    // name silently disappears — and the list would fall back to showing raw
    // atlasIds without any test noticing.
    const [a] = parseEditableAtlasList({ atlases: [entry()] });
    expect(a.displayName).toBe('PET CHARACTER');
    expect(a.description).toBe('Pet poses and expressions');
  });

  it('rejects a truthy-but-not-true editable flag', () => {
    expect(parseEditableAtlasList({ atlases: [entry({ editable: 'yes' })] })).toEqual([]);
    expect(parseEditableAtlasList({ atlases: [entry({ editable: 1 })] })).toEqual([]);
  });

  it('drops an entry missing any of its three required paths', () => {
    expect(parseEditableAtlasList({ atlases: [entry({ png: '' })] })).toEqual([]);
    expect(parseEditableAtlasList({ atlases: [entry({ json: undefined })] })).toEqual([]);
    expect(parseEditableAtlasList({ atlases: [entry({ atlasId: '   ' })] })).toEqual([]);
  });

  it('treats a blank animations path as absent rather than as a file named ""', () => {
    const [a] = parseEditableAtlasList({ atlases: [entry({ animations: '  ' })] });
    expect(a.animations).toBeUndefined();
  });

  it('returns an empty list for malformed configs instead of throwing', () => {
    expect(parseEditableAtlasList(null)).toEqual([]);
    expect(parseEditableAtlasList({})).toEqual([]);
    expect(parseEditableAtlasList({ atlases: 'nope' })).toEqual([]);
    expect(parseEditableAtlasList({ atlases: [null, 42, 'x'] })).toEqual([]);
  });

  it('agrees with the real assets.json', () => {
    const list = parseEditableAtlasList(readJson('public/configs/assets.json'));
    expect(list.length).toBeGreaterThan(0);
    list.forEach((a) => {
      expect(a.editable).toBe(true);
      expect(a.png).toBeTruthy();
      expect(a.json).toBeTruthy();
      // Checked here, after parsing, rather than against the raw config: what
      // the pick list renders is the parser's output, not the file.
      expect(a.displayName, `${a.atlasId} has no displayName`).toBeTruthy();
      expect(a.description, `${a.atlasId} has no description`).toBeTruthy();
    });
  });
});

describe('pickDefaultAtlas', () => {
  const list = [
    { atlasId: 'a', png: 'a.png', json: 'a.json', editable: true },
    { atlasId: 'b', png: 'b.png', json: 'b.json', editable: true },
  ];

  it('prefers the caller\'s target when it is editable', () => {
    expect(pickDefaultAtlas(list, 'b')?.atlasId).toBe('b');
  });

  it('falls back to the first entry when the target is not editable', () => {
    // The Pet can launch the editor for an atlas the whitelist excludes; opening
    // on something beats opening on nothing.
    expect(pickDefaultAtlas(list, 'ui_frame')?.atlasId).toBe('a');
  });

  it('falls back when no target is given', () => {
    expect(pickDefaultAtlas(list)?.atlasId).toBe('a');
    expect(pickDefaultAtlas(list, '  ')?.atlasId).toBe('a');
  });

  it('returns null when nothing is editable', () => {
    expect(pickDefaultAtlas([], 'a')).toBeNull();
  });
});
