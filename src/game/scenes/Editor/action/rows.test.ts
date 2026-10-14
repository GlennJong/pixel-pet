import { describe, it, expect } from 'vitest';
import { groupRows, segmentRows } from './rows';
import { CATALOG } from './catalog';

const item = (group: string, label: string) =>
  CATALOG.find((g) => g.id === group)!.items.find((i) => i.label === label)!;

describe('basic editor rows', () => {
  it('lists the groups with what is in them', () => {
    expect(groupRows()[0]).toEqual({ key: 'idle', label: '閒晃', description: '站立、閒置1、閒置2、移動' });
  });

  it('names segments only while the performance has their shape', () => {
    const sleep = item('rest', '睡覺');
    expect(segmentRows(sleep, ['lay-down', 'sleep']).map((r) => r.label)).toEqual(['倒地', '睡覺中']);
    expect(segmentRows(sleep, ['sleep']).map((r) => r.label)).toEqual(['第 1 段']);
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
