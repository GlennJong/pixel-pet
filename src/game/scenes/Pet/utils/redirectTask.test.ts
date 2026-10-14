import { describe, it, expect, vi } from 'vitest';
import { redirectTask } from './redirectTask';
import type { ActionMap } from '../elements/PetCharacter/types';
import type { ConditionDef } from '../types/conditions';
import type { Task } from '../types/task';

const actions: ActionMap = {
  drink: {
    animationSet: { default: ['drink'] },
    effect: { hp: { method: 'add', value: 10 } },
    dialogues: [{ priority: 2, sentences: [{ portrait: 'face-normal', scriptId: 'action.drink' }] }],
  },
  lock: {
    animationSet: { default: ['egg'] },
    dialogues: [{ priority: 2, sentences: [{ portrait: 'face-normal', scriptId: 'action.lock' }] }],
  },
  revive: { animationSet: { default: ['revive'] } },
};

const death: ConditionDef = { redirect: { to: 'lock', except: ['revive'] } };

// What the chat path queues: the action's own config already spread in.
const chatDrink = (): Task => ({
  id: 't1',
  user: 'viewer',
  ...actions.drink,
  action: 'drink',
  params: { coin: 3 },
});

describe('redirectTask', () => {
  it('leaves a task alone when the condition has no redirect', () => {
    const task = chatDrink();
    expect(redirectTask(task, {}, actions)).toBe(task);
    expect(redirectTask(task, undefined, actions)).toBe(task);
  });

  it('replaces what happens, keeps who asked', () => {
    const callback = vi.fn();
    const out = redirectTask({ ...chatDrink(), callback }, death, actions);
    expect(out.action).toBe('lock');
    expect(out.dialogues).toBe(actions.lock.dialogues);
    expect(out.effect).toBeUndefined(); // no hp +10 for a dead pet
    expect(out).toMatchObject({ id: 't1', user: 'viewer', params: { coin: 3 } });
    expect(out.callback).toBe(callback);
  });

  it('lets the way out through', () => {
    const task: Task = { user: 'system', action: 'revive' };
    expect(redirectTask(task, death, actions)).toBe(task);
  });

  it('does not redirect the target to itself', () => {
    const task: Task = { user: 'system', action: 'lock' };
    expect(redirectTask(task, death, actions)).toBe(task);
  });

  it('runs the original when the target is missing, rather than nothing', () => {
    const task = chatDrink();
    expect(redirectTask(task, { redirect: { to: 'nope' } }, actions)).toBe(task);
  });
});
