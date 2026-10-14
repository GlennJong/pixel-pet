import type { ActionConfig, AnimationSet, GameConfigFiles } from './types';

/**
 * How each condition is performed, read off the actions that define it.
 *
 * The files spell every condition out for every action (see docs: explicit
 * cells), but the basic editor never asks the user for them one by one. It
 * asks once — "what does sleeping look like" — and these rules write the
 * answer into every action. The integrity check applies the same rules, so
 * the files and the editor cannot disagree about them.
 *
 *   睡覺 [倒地, 睡覺中] → others asleep: 起身 ▸ action ▸ 倒地; idles: 睡覺中
 *   睡覺 [睡覺中]       → no bridging; others play as they are
 *   起床 [起身]
 *   a condition with a redirect → every action looks like the redirect target
 */

export const SLEEP_ACTION = 'sleep';
export const WAKE_ACTION = 'wake';
export const SLEEP_CONDITION = 'sleep';

export type Section = 'idleActions' | 'actions';

export const branchKey = (condition: string) => `condition:${condition}`;

/**
 * Actions that move the pet between conditions. They are how a condition is
 * entered or left, so the condition's rule must not overwrite them — `revive`
 * performed as an egg would never revive.
 */
export function conditionChangers(files: GameConfigFiles): Set<string> {
  return new Set(
    files.effects.filter((e) => e.effect.condition?.method === 'set').map((e) => e.action),
  );
}

export function findAction(files: GameConfigFiles, name: string): ActionConfig | undefined {
  return files.character.actions[name] ?? files.character.idleActions[name];
}

const performance = (files: GameConfigFiles, name: string) =>
  findAction(files, name)?.animationSet.default ?? [];

/**
 * The condition cells an action should have, given its default performance.
 * Null for an action the rules leave alone (see {@link conditionChangers}).
 */
export function expectedConditionCells(
  files: GameConfigFiles,
  section: Section,
  name: string,
  base: string[],
  changers = conditionChangers(files),
): AnimationSet | null {
  if (changers.has(name)) return null;

  const sleep = performance(files, SLEEP_ACTION);
  const wake = performance(files, WAKE_ACTION);

  const cells: AnimationSet = {};
  for (const [condition, def] of Object.entries(files.conditions)) {
    let seq: string[];
    if (def.redirect) {
      seq = performance(files, def.redirect.to);
    } else if (condition === SLEEP_CONDITION) {
      if (section === 'idleActions') seq = sleep.slice(-1);
      else seq = sleep.length > 1 ? [...wake, ...base, sleep[0]] : base;
    } else {
      seq = base;
    }
    cells[branchKey(condition)] = [...seq];
  }
  return cells;
}
