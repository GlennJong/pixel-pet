import { describe, it, expect } from 'vitest';
import { groupRows } from './rows';

describe('basic editor rows', () => {
  it('lists the groups with what is in them', () => {
    expect(groupRows()[0]).toEqual({ key: 'idle', label: '閒晃', description: '站立、閒置1、閒置2、移動' });
  });

});

describe('portrait labels', () => {
  it('names the known faces 喜/怒/哀 and falls back to the face name', async () => {
    const { portraitLabel } = await import('./catalog');
    expect(['face-normal', 'face-angry', 'face-sad'].map(portraitLabel)).toEqual(['喜', '怒', '哀']);
    expect(portraitLabel('face-shy')).toBe('shy');
    expect(portraitLabel(undefined)).toBe('—');
  });
});
