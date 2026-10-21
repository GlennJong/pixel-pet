import { describe, it, expect } from 'vitest';
import { dialogueReplacement } from './ActionRunner';

describe('dialogueReplacement', () => {
  it('fills {{user}} and each effect amount by its key', () => {
    const effect = { hp: { method: 'add' as const, value: 10 }, coin: { method: 'sub' as const, value: 5 } };
    expect(dialogueReplacement('觀眾', effect, undefined)).toEqual({ user: '觀眾', hp: 10, coin: 5 });
  });

  it("lets the task's own params win over the effect", () => {
    const effect = { coin: { method: 'add' as const, value: 5 } };
    expect(dialogueReplacement('system', effect, { coin: 99 })).toEqual({ user: 'system', coin: 99 });
  });

  it('works without an effect', () => {
    expect(dialogueReplacement('system', undefined, undefined)).toEqual({ user: 'system' });
  });
});
