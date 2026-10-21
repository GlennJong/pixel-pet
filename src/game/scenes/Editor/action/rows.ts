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
