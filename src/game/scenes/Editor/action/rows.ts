import type { OptionMenuItem } from '../elements';
import { CATALOG, CatalogGroup, CatalogItem } from './catalog';

/**
 * What the basic editor's lists show, computed from the catalog. Pure, so the
 * rows can be tested without a scene; the registry decides what choosing a
 * row does.
 */

export function findGroup(id: string): CatalogGroup | undefined {
  return CATALOG.find((g) => g.id === id);
}

export function findItem(groupId: string, index: number): CatalogItem | undefined {
  return findGroup(groupId)?.items[index];
}

export function groupRows(): OptionMenuItem[] {
  return CATALOG.map((g) => ({
    key: g.id,
    label: g.label,
    description: g.items.map((i) => i.label).join('、'),
  }));
}

export function segmentRows(item: CatalogItem, seq: string[]): OptionMenuItem[] {
  // Segment names are positional, so they only hold while the performance
  // has the shape they describe — 睡覺 cut to one part is no longer 倒地.
  const names = item.segments?.length === seq.length ? item.segments : undefined;
  return seq.map((prefix, i) => ({
    key: String(i),
    label: names?.[i] ?? `第 ${i + 1} 段`,
    description: prefix,
  }));
}
