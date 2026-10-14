import { describe, it, expect } from 'vitest';
import { checkGameConfig, IntegrityRule } from './integrity';
import { conditionChangers } from './rules';
import { loadShippedConfig, shippedAtlases } from './shipped.testkit';
import type { GameConfigFiles } from './types';

/**
 * The shipped config must pass every integrity rule. Each rule gets its own
 * test so a failure names what broke; the second half breaks the config on
 * purpose to prove each rule actually fires.
 */

const atlas = shippedAtlases();
const shipped = loadShippedConfig();
const violations = checkGameConfig(shipped, atlas);

const RULES: IntegrityRule[] = [
  'atlas-registered', 'animation-exists', 'portrait-exists', 'idle-fallback',
  'branches-complete', 'condition-presentation', 'redirect-target', 'redirect-exit',
  'redirect-header', 'script-exists', 'placeholder', 'effect-refs', 'auto-action-refs',
  'command-refs', 'action-triggered', 'header-menu', 'header-stats', 'header-chrome',
  'room-stages', 'room-art', 'dialogue-frame',
];

describe('the shipped config is a closed loop', () => {
  it.each(RULES)('%s', (rule) => {
    expect(violations.filter((v) => v.rule === rule).map((v) => v.detail)).toEqual([]);
  });

  it('exempts exactly the actions that change condition', () => {
    expect([...conditionChangers(shipped)].sort()).toEqual(['die', 'revive', 'sleep', 'wake']);
  });
});

describe('each rule fires when broken', () => {
  const broken = (mutate: (f: GameConfigFiles) => void) => {
    const files = structuredClone(shipped);
    mutate(files);
    return new Set(checkGameConfig(files, atlas).map((v) => v.rule));
  };

  it.each<[IntegrityRule, (f: GameConfigFiles) => void]>([
    ['animation-exists', (f) => { f.character.actions.eat.animationSet.default = ['drnk']; }],
    ['portrait-exists', (f) => { f.character.actions.eat.dialogues![0].sentences[0].portrait = 'face-nope'; }],
    ['idle-fallback', (f) => { f.character.settings.idlePrefix = 'nope'; }],
    ['branches-complete', (f) => { delete f.character.actions.work.animationSet['condition:death']; }],
    ['condition-presentation', (f) => { f.character.actions.eat.animationSet['condition:death'] = ['drink']; }],
    ['redirect-target', (f) => { f.conditions.death.redirect!.to = 'nope'; }],
    ['redirect-exit', (f) => { f.conditions.death.redirect!.except = ['eat']; }],
    ['redirect-header', (f) => { f.header.menu[0].action['condition:death'] = 'eat'; }],
    ['script-exists', (f) => { f.character.actions.eat.dialogues![0].sentences[0].scriptId = 'action.nope'; }],
    ['placeholder', (f) => { (f.locale.action as Record<string, string>).eat = '{{level}}'; }],
    ['effect-refs', (f) => { f.effects[0].action = 'nope'; }],
    ['auto-action-refs', (f) => { f.autoActions[0].when = { nope: { op: '==', value: 1 } }; }],
    ['command-refs', (f) => { f.commands.eat.action = 'nope'; }],
    ['action-triggered', (f) => { f.autoActions = f.autoActions.filter((a) => a.action !== 'revive'); }],
    ['header-menu', (f) => { f.header.menu[0].animation.selected = 'nope'; }],
    ['header-stats', (f) => { f.header.stats[0].stat = 'nope'; }],
    ['header-chrome', (f) => { f.header.arrow.animation = 'nope'; }],
    ['room-stages', (f) => { f.room.stages.pop(); }],
    ['room-art', (f) => { f.room.stages[0].background = 'nope'; }],
    ['dialogue-frame', (f) => { f.dialogue.frameFrame = 'nope'; }],
    ['atlas-registered', (f) => { f.character.atlasId = 'nope'; }],
  ])('%s', (rule, mutate) => {
    expect(broken(mutate)).toContain(rule);
  });
});
