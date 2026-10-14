import { describe, it, expect } from 'vitest';
import { GameConfigProject } from './GameConfigProject';
import { CATALOG, HIDDEN_ACTIONS, catalogActions } from './catalog';
import { checkGameConfig, conditionChangers, findAction } from '@/game/gameConfig';
import { loadShippedConfig, shippedAtlases } from '@/game/gameConfig/shipped.testkit';

const atlas = shippedAtlases();
const shipped = loadShippedConfig();
const fresh = () => new GameConfigProject(shipped);
const problems = (p: GameConfigProject) => checkGameConfig(p.snapshot(), atlas);
const cells = (p: GameConfigProject, action: string) => findAction(p.snapshot(), action)!.animationSet;

describe('GameConfigProject: performance', () => {
  it('changes nothing until asked to', () => {
    expect(fresh().snapshot()).toEqual(shipped);
  });

  it('writing back the same performance reproduces the shipped files', () => {
    const p = fresh();
    for (const name of catalogActions()) p.setAnimation(name, p.animation(name));
    expect(p.snapshot()).toEqual(shipped);
  });

  it('carries an ordinary action into every condition', () => {
    const p = fresh();
    p.setAnimation('eat', ['write']);
    expect(cells(p, 'eat')).toEqual({
      default: ['write'],
      'condition:normal': ['write'],
      'condition:sleep': ['wake-up', 'write', 'lay-down'],
      'condition:death': ['egg'],
    });
    expect(problems(p)).toEqual([]);
  });

  it('drops the bridge when sleep is a single part', () => {
    const p = fresh();
    p.setAnimation('sleep', ['sleep']);
    expect(cells(p, 'eat')['condition:sleep']).toEqual(['drink']);
    expect(cells(p, 'move-left')['condition:sleep']).toEqual(['sleep']);
    expect(problems(p)).toEqual([]);
  });

  it('bridges with whatever wake and sleep now perform', () => {
    const p = fresh();
    p.setAnimation('wake', ['revive']);
    p.setAnimation('sleep', ['egg', 'sleep']);
    expect(cells(p, 'eat')['condition:sleep']).toEqual(['revive', 'drink', 'egg']);
    expect(cells(p, 'stand-left')['condition:sleep']).toEqual(['sleep']);
    expect(problems(p)).toEqual([]);
  });

  it('changes how everything looks dead by changing 死亡中', () => {
    const p = fresh();
    p.setAnimation('lock', ['face-sad']);
    expect(cells(p, 'eat')['condition:death']).toEqual(['face-sad']);
    expect(cells(p, 'move-right')['condition:death']).toEqual(['face-sad']);
    // revive is how the pet leaves death; it must still look like reviving.
    expect(cells(p, 'revive')['condition:death']).toEqual(['revive']);
    expect(problems(p)).toEqual([]);
  });

  it('carries a condition changer’s own cells along', () => {
    const p = fresh();
    p.setAnimation('die', ['egg']);
    expect(cells(p, 'die')).toEqual({
      default: ['egg'],
      'condition:normal': ['egg'],
      'condition:sleep': ['egg'],
      'condition:death': ['egg'],
    });
    expect(problems(p)).toEqual([]);
  });
});

describe('GameConfigProject: effects', () => {
  it('reads and writes signed amounts', () => {
    const p = fresh();
    expect(p.effect('buy-lv1', 'coin')).toBe(-100);
    expect(p.effect('eat', 'hp')).toBe(10);
    p.setEffect('buy-lv1', 'coin', -120);
    expect(p.snapshot().effects.find((e) => e.action === 'buy-lv1')!.effect.coin)
      .toEqual({ method: 'sub', value: 120 });
  });

  it('keeps a zero, so a dialogue that prints the amount still has one', () => {
    const p = fresh();
    p.setEffect('buy-lv1', 'coin', 0);
    expect(p.effect('buy-lv1', 'coin')).toBe(0);
    expect(problems(p)).toEqual([]);
  });

  it('adds an effect an action did not have', () => {
    const p = fresh();
    expect(p.effect('work', 'hp')).toBeUndefined();
    p.setEffect('work', 'hp', 5);
    expect(p.effect('work', 'hp')).toBe(5);
  });
});

describe('GameConfigProject: dialogue', () => {
  it('edits the line and the portrait', () => {
    const p = fresh();
    p.setDialogueText('eat', '好吃！{{user}} 請客');
    p.setPortrait('eat', 'face-angry');
    expect(p.dialogue('eat')).toEqual({ text: '好吃！{{user}} 請客', portrait: 'face-angry' });
    expect(problems(p)).toEqual([]);
  });

  it('leaves the shipped files alone', () => {
    const p = fresh();
    p.setDialogueText('eat', 'x');
    expect((shipped.locale.action as Record<string, string>).eat).not.toBe('x');
  });
});

describe('a whole session of basic edits stays a closed loop', () => {
  it('passes every integrity rule', () => {
    const p = fresh();
    p.setAnimation('stand-left', ['wink-left']);
    p.setAnimation('move-right', ['walk-right', 'stare-right']);
    p.setAnimation('sleep', ['lay-down', 'sleep']);
    p.setAnimation('wake', ['wake-up']);
    p.setAnimation('lock', ['egg']);
    p.setEffect('eat', 'hp', 25);
    p.setEffect('work', 'coin', 3);
    for (let lv = 1; lv <= 5; lv++) p.setEffect(`buy-lv${lv}`, 'coin', -50 * lv);
    p.setDialogueText('work', '加班中…賺到 {{coin}} 元');
    p.setPortrait('die', 'face-angry');
    expect(problems(p)).toEqual([]);
  });
});

describe('catalog', () => {
  const all = [...Object.keys(shipped.character.idleActions), ...Object.keys(shipped.character.actions)];

  it('names only actions that exist', () => {
    expect(catalogActions().filter((a) => !all.includes(a))).toEqual([]);
  });

  it('places every action, or hides it on purpose', () => {
    const placed = new Set([...catalogActions(), ...HIDDEN_ACTIONS]);
    expect(all.filter((a) => !placed.has(a))).toEqual([]);
  });

  it('never offers the effects of an action that changes condition', () => {
    const changers = conditionChangers(shipped);
    const bad = CATALOG.flatMap((g) => g.items)
      .filter((i) => i.actions.some((a) => changers.has(a)))
      .filter((i) => i.fields.includes('hp') || i.fields.includes('coin'))
      .map((i) => i.label);
    expect(bad).toEqual([]);
  });

  it('offers dialogue only where the action has one', () => {
    const bad = CATALOG.flatMap((g) => g.items)
      .filter((i) => i.fields.includes('dialogue'))
      .flatMap((i) => i.actions)
      .filter((a) => !findAction(shipped, a)?.dialogues?.length);
    expect(bad).toEqual([]);
  });

  it('names one segment per part of the shipped performance', () => {
    const bad = CATALOG.flatMap((g) => g.items)
      .filter((i) => i.segments)
      .filter((i) => findAction(shipped, i.actions[0])!.animationSet.default.length !== i.segments!.length)
      .map((i) => i.label);
    expect(bad).toEqual([]);
  });
});
