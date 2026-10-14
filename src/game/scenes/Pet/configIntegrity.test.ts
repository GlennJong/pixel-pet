import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The shipped game config must form a closed loop: every name one file uses
 * is defined in another. Nothing here runs at play time — a broken reference
 * fails silently in the game (Pet falls back to `default`, or plays nothing),
 * so this is the only place it gets caught.
 *
 * The editor's basic mode writes into these files; whatever it writes must
 * keep every test here green.
 */

const PUBLIC = join(__dirname, '../../../../public');
const read = (rel: string) => JSON.parse(readFileSync(join(PUBLIC, rel), 'utf8'));

const assets = read('configs/assets.json');
const character = read('configs/pet/character/core.json');
const conditions = read('configs/pet/character/conditions.json');
const effects: { action: string; effect: Record<string, { method: string; value: unknown }> }[] =
  read('configs/pet/character/effects.json');
const autoActions: { action: string; when: Record<string, { op: string; value: unknown }> }[] =
  read('configs/pet/character/autoActions.json');
const stats: { id: string; value: number }[] = read('configs/pet/character/stats.json');
const commands: Record<string, { action: string }> = read('configs/system/commands.json');
const header = read('configs/pet/header/core.json');
const room = read('configs/pet/room/core.json');
const dialogue = read('configs/global/dialogue/core.json');
const locale = read('configs/locales/zh-tw.json');

/** Runtime keys written by something outside these files (a mini-game, for `win`). */
const EXTERNAL_KEYS = ['win'];

function atlas(atlasId: string) {
  const entry = assets.atlases.find((a: { atlasId: string }) => a.atlasId === atlasId);
  if (!entry) throw new Error(`atlas "${atlasId}" is not registered in assets.json`);
  const animations: { prefix: string }[] = entry.animations ? read(entry.animations) : [];
  return {
    prefixes: new Set(animations.map((a) => a.prefix)),
    frames: new Set(frameNames(read(entry.json))),
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

const conditionNames = Object.keys(conditions);
const statIds = stats.map((s) => s.id);
const stateKeys = [...statIds, 'condition', ...EXTERNAL_KEYS];

type ActionDef = {
  animationSet: Record<string, string[]>;
  dialogues?: { sentences: { portrait?: string; scriptId?: string }[] }[];
};
const stageActions = (character.stages ?? []).flatMap(
  (s: { actions?: Record<string, ActionDef> }) => Object.entries(s.actions ?? {}),
) as [string, ActionDef][];
const idleActions = Object.entries(character.idleActions) as [string, ActionDef][];
const actions = [
  ...(Object.entries(character.actions) as [string, ActionDef][]),
  ...stageActions,
];
const actionNames = new Set(actions.map(([name]) => name));

/** Actions that move the pet between conditions — exempt from the state rules. */
const conditionChangers = new Set(
  effects.filter((e) => e.effect.condition?.method === 'set').map((e) => e.action),
);

function lookup(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
    obj,
  );
}

describe('character: animations exist', () => {
  const atlasIds: string[] = [
    character.atlasId,
    ...(character.stages ?? []).map((s: { atlasId?: string }) => s.atlasId).filter(Boolean),
  ];

  it.each([...new Set(atlasIds)])('every animation the pet plays exists in %s', (atlasId) => {
    const { prefixes } = atlas(atlasId);
    const missing = [...idleActions, ...actions].flatMap(([name, def]) =>
      Object.entries(def.animationSet).flatMap(([branch, seq]) =>
        seq.filter((p) => !prefixes.has(p)).map((p) => `${name}.${branch}: ${p}`),
      ),
    );
    expect(missing).toEqual([]);
  });

  it.each([...new Set(atlasIds)])('every dialogue portrait exists in %s', (atlasId) => {
    const { prefixes } = atlas(atlasId);
    const missing = actions.flatMap(([name, def]) =>
      (def.dialogues ?? []).flatMap((d) =>
        d.sentences.filter((s) => s.portrait && !prefixes.has(s.portrait))
          .map((s) => `${name}: ${s.portrait}`),
      ),
    );
    expect(missing).toEqual([]);
  });

  it('has an idle action for each facing the pet falls back to', () => {
    const names = idleActions.map(([n]) => n);
    expect(names).toContain(`${character.settings.idlePrefix}-left`);
    expect(names).toContain(`${character.settings.idlePrefix}-right`);
  });
});

describe('character: every action states every condition', () => {
  const branches = ['default', ...conditionNames.map((c) => `condition:${c}`)];

  it.each([...idleActions, ...actions])('%s', (_name, def) => {
    expect(Object.keys(def.animationSet).sort()).toEqual([...branches].sort());
  });

  it('names only conditions that exist', () => {
    const unknown = [...idleActions, ...actions].flatMap(([name, def]) =>
      Object.keys(def.animationSet)
        .filter((k) => k !== 'default' && !conditionNames.includes(k.replace(/^condition:/, '')))
        .map((k) => `${name}.${k}`),
    );
    expect(unknown).toEqual([]);
  });
});

/**
 * The basic-mode editor sets each condition's presentation once and writes it
 * into every action. These pin that the shipped config already has that shape,
 * so the first save in the editor changes nothing.
 */
describe('character: condition presentation follows its rule', () => {
  const rule = (section: 'idle' | 'action', name: string, base: string[]) => {
    if (conditionChangers.has(name)) return null;
    return {
      'condition:normal': base,
      'condition:death': ['egg'],
      'condition:sleep': section === 'idle' ? ['sleep'] : ['wake-up', ...base, 'lay-down'],
    };
  };

  it.each(idleActions)('idle %s', (name, def) => {
    const want = rule('idle', name, def.animationSet.default);
    if (want) expect(def.animationSet).toMatchObject(want);
  });

  it.each(actions)('action %s', (name, def) => {
    const want = rule('action', name, def.animationSet.default);
    if (want) expect(def.animationSet).toMatchObject(want);
  });

  it('exempts the actions that change condition', () => {
    expect([...conditionChangers].sort()).toEqual(['awake', 'die', 'revive', 'sleep']);
  });
});

describe('dialogue text exists', () => {
  it('every scriptId resolves in the locale', () => {
    const missing = actions.flatMap(([name, def]) =>
      (def.dialogues ?? []).flatMap((d) =>
        d.sentences.filter((s) => s.scriptId && typeof lookup(locale, s.scriptId) !== 'string')
          .map((s) => `${name}: ${s.scriptId}`),
      ),
    );
    expect(missing).toEqual([]);
  });
});

describe('mechanics refer to things that exist', () => {
  it('effects target defined actions and state', () => {
    const bad = effects.flatMap((e) => [
      ...(actionNames.has(e.action) ? [] : [`action: ${e.action}`]),
      ...Object.keys(e.effect).filter((k) => !stateKeys.includes(k)).map((k) => `${e.action}.${k}`),
    ]);
    expect(bad).toEqual([]);
  });

  it('effects only set conditions that exist', () => {
    const bad = effects
      .filter((e) => e.effect.condition && !conditionNames.includes(String(e.effect.condition.value)))
      .map((e) => `${e.action}: ${e.effect.condition.value}`);
    expect(bad).toEqual([]);
  });

  it('auto actions trigger defined actions on defined state', () => {
    const bad = autoActions.flatMap((a) => [
      ...(actionNames.has(a.action) ? [] : [`action: ${a.action}`]),
      ...Object.keys(a.when).filter((k) => !stateKeys.includes(k)).map((k) => `${a.action}.${k}`),
      ...(a.when.condition && !conditionNames.includes(String(a.when.condition.value))
        ? [`${a.action}: condition ${a.when.condition.value}`] : []),
    ]);
    expect(bad).toEqual([]);
  });

  it('chat commands trigger defined actions', () => {
    const bad = Object.values(commands).filter((c) => !actionNames.has(c.action)).map((c) => c.action);
    expect(bad).toEqual([]);
  });

  it('every action can be triggered from somewhere', () => {
    const triggered = new Set<string>([
      ...autoActions.map((a) => a.action),
      ...Object.values(commands).map((c) => c.action),
      ...header.menu.flatMap((m: { action: Record<string, string> }) => Object.values(m.action)),
    ]);
    expect([...actionNames].filter((n) => !triggered.has(n))).toEqual([]);
  });
});

describe('header', () => {
  const { prefixes, frames } = atlas(header.atlasId);

  it('menu items use existing icons and actions in every condition', () => {
    const bad = header.menu.flatMap(
      (m: { animation: Record<string, string>; action: Record<string, string> }, i: number) => [
        ...Object.values(m.animation).filter((p) => !prefixes.has(p)).map((p) => `menu[${i}] icon: ${p}`),
        ...Object.values(m.action).filter((a) => !actionNames.has(a)).map((a) => `menu[${i}] action: ${a}`),
        ...['default', ...conditionNames.map((c) => `condition:${c}`)]
          .filter((k) => !(k in m.action)).map((k) => `menu[${i}] missing ${k}`),
      ],
    );
    expect(bad).toEqual([]);
  });

  it('stats show defined stats with existing art', () => {
    type Threshold = { animation?: string; frame?: string };
    type Row = { stat: string; animation?: string; thresholds?: Threshold[] };
    const bad = header.stats.flatMap((s: Row) => [
      ...(statIds.includes(s.stat) ? [] : [`stat: ${s.stat}`]),
      ...(s.animation && !prefixes.has(s.animation) ? [`${s.stat}: ${s.animation}`] : []),
      ...(s.thresholds ?? []).flatMap((t) => [
        ...(t.animation && !prefixes.has(t.animation) ? [`${s.stat}: ${t.animation}`] : []),
        ...(t.frame && !frames.has(t.frame) ? [`${s.stat}: frame ${t.frame}`] : []),
      ]),
    ]);
    expect(bad).toEqual([]);
  });

  it('arrow and window frame exist', () => {
    expect(prefixes.has(header.arrow.animation)).toBe(true);
    expect(atlas(header.frame.atlasId).frames.has(header.frame.textureFrame)).toBe(true);
  });
});

describe('room', () => {
  const { prefixes } = atlas(room.atlasId);

  it('stage i sits at index i (Room looks stages up by position)', () => {
    room.stages.forEach((s: { value: number }, i: number) => expect(s.value).toBe(i));
  });

  it('has a stage for every level the game can reach', () => {
    const watched = stats.find((s) => s.id === room.watch);
    const reachable = new Set<number>([
      watched?.value ?? 0,
      ...effects.flatMap((e) => {
        const set = e.effect[room.watch];
        return set?.method === 'set' ? [Number(set.value)] : [];
      }),
    ]);
    expect([...reachable].filter((lv) => !room.stages[lv])).toEqual([]);
  });

  it('every stage uses existing art', () => {
    type Stage = { value: number; background: string; back: string; front: string;
      extras?: { animation: string }[] };
    const missing = room.stages.flatMap((s: Stage) =>
      [s.background, s.back, s.front, ...(s.extras ?? []).map((x) => x.animation)]
        .filter((p) => !prefixes.has(p)).map((p) => `stage ${s.value}: ${p}`),
    );
    expect(missing).toEqual([]);
  });
});

describe('dialogue box', () => {
  it('uses an existing frame', () => {
    expect(atlas(dialogue.frameKey).frames.has(dialogue.frameFrame)).toBe(true);
  });
});
