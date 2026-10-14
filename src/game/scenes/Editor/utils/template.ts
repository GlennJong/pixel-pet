import { AnimationItem, AtlasEntry, isValidPrefix } from '@/game/assets';
import { fetchJson } from '@/utils/assetUrl';
import { isRecord, toInteger } from './json';

/**
 * Slot template — what an editable atlas is *supposed* to contain.
 *
 * The slot list comes from the atlas's **factory** `animations.json`, never from
 * the running game's data. Two reasons:
 *
 *  - A saved customization replaces the atlas wholesale, so the live data is the
 *    user's last edit, not the thing being edited *against*.
 *  - The consuming config is not a usable source: the names it references sit at
 *    different JSON paths per config type (`animationSet.*[]` and `portrait` for
 *    the character, `stages[].background` for the room, …), and reading only the
 *    obvious one silently drops slots. The factory `animations.json` is uniform
 *    across every atlas and complete by construction.
 *
 * It also carries each slot's shipped `qty` / `freq` / `repeat`, so a new edit
 * starts from sensible values instead of blank fields.
 */

export interface SlotDefinition {
  /** Animation name. Fixed — the game's config refers to it by this name. */
  prefix: string;
  /** How many frames the shipped version used. A suggestion, not a limit. */
  qty: number;
  freq: number;
  repeat: number;
  repeatDelay?: number;
  duration?: number;
}

export interface SlotTemplate {
  atlasId: string;
  slots: SlotDefinition[];
  /** Non-fatal problems with the factory data (reported, never thrown). */
  warnings: string[];
}

/** Build a template from an already-loaded `animations.json`. Pure. */
export function buildSlotTemplate(atlasId: string, animationsJson: unknown): SlotTemplate {
  const warnings: string[] = [];

  if (!Array.isArray(animationsJson)) {
    return { atlasId, slots: [], warnings: [`${atlasId}: animations.json is not an array`] };
  }

  const slots: SlotDefinition[] = [];
  const seen = new Set<string>();

  animationsJson.forEach((raw, i) => {
    if (!isRecord(raw)) {
      warnings.push(`${atlasId}: animations.json[${i}] is not an object`);
      return;
    }

    const prefix = typeof raw.prefix === 'string' ? raw.prefix.trim() : '';
    if (!prefix) {
      warnings.push(`${atlasId}: animations.json[${i}] has no prefix`);
      return;
    }
    if (!isValidPrefix(prefix)) {
      warnings.push(`${atlasId}: prefix "${prefix}" breaks the naming rule`);
    }
    if (seen.has(prefix)) {
      warnings.push(`${atlasId}: duplicate prefix "${prefix}"`);
      return;
    }
    seen.add(prefix);

    const slot: SlotDefinition = {
      prefix,
      qty: Math.max(1, toInteger(raw.qty, 1)),
      freq: Math.max(1, toInteger(raw.freq, 8)),
      repeat: toInteger(raw.repeat, 0),
    };
    // Carried through so a round-trip cannot silently drop them.
    if (typeof raw.repeatDelay === 'number') slot.repeatDelay = Math.max(0, toInteger(raw.repeatDelay, 0));
    if (typeof raw.duration === 'number') slot.duration = Math.max(0, toInteger(raw.duration, 0));

    slots.push(slot);
  });

  return { atlasId, slots, warnings };
}

// ── The editable atlas list ──────────────────────────────────────────────────

export const ASSETS_CONFIG_PATH = 'configs/assets.json';

/**
 * The editable atlases declared in an already-loaded assets config. Pure.
 *
 * Whitelist, not blacklist: an atlas is editable only when it says
 * `editable: true`, and an entry missing any of its three paths is dropped
 * rather than half-trusted. Anything whose meaning depends on numbers outside
 * it (a nineslice's insets) or that is the editor's own chrome stays out — see
 * the asset contract.
 */
export function parseEditableAtlasList(configData: unknown): AtlasEntry[] {
  if (!isRecord(configData) || !Array.isArray(configData.atlases)) return [];

  return configData.atlases.reduce<AtlasEntry[]>((list, entry) => {
    if (!isRecord(entry)) return list;
    if (entry.editable !== true) return list;

    const atlasId = typeof entry.atlasId === 'string' ? entry.atlasId.trim() : '';
    const png = typeof entry.png === 'string' ? entry.png.trim() : '';
    const json = typeof entry.json === 'string' ? entry.json.trim() : '';
    if (!atlasId || !png || !json) return list;

    const optional = (value: unknown) =>
      typeof value === 'string' && value.trim() ? value.trim() : undefined;

    list.push({
      atlasId,
      png,
      json,
      animations: optional(entry.animations),
      editable: true,
      // Carried, not dropped: these are what the pick list shows. Rebuilding the
      // entry field by field is what keeps unknown keys out, so every field the
      // editor needs has to be named here.
      displayName: optional(entry.displayName),
      description: optional(entry.description),
    });
    return list;
  }, []);
}

/** Fetch the assets config and return only the atlases the editor may touch. */
export async function loadEditableAtlasList(): Promise<AtlasEntry[]> {
  return parseEditableAtlasList(await fetchJson<unknown>(ASSETS_CONFIG_PATH));
}

/**
 * Pick the atlas the editor should open with. `preferredId` is the caller's
 * target (the Pet passes the atlas it launched the editor for); it must still
 * be editable, so an unknown or locked id falls back to the first editable
 * atlas — opening on *something* beats opening on nothing. Pure.
 */
export function pickDefaultAtlas(
  list: readonly AtlasEntry[],
  preferredId?: string,
): AtlasEntry | null {
  if (list.length === 0) return null;
  const wanted = (preferredId || '').trim();
  if (wanted) {
    const match = list.find((atlas) => atlas.atlasId === wanted);
    if (match) return match;
  }
  return list[0];
}

export async function resolveDefaultAtlas(preferredId?: string): Promise<AtlasEntry | null> {
  return pickDefaultAtlas(await loadEditableAtlasList(), preferredId);
}

/** Fetch the factory `assets.json` and return the entry for `atlasId`. */
export async function loadFactoryAtlasEntry(atlasId: string): Promise<AtlasEntry | null> {
  const data = await fetchJson<unknown>(ASSETS_CONFIG_PATH);
  if (!isRecord(data) || !Array.isArray(data.atlases)) return null;

  const found = data.atlases.find(
    (entry) => isRecord(entry) && entry.atlasId === atlasId,
  );
  return isRecord(found) ? (found as unknown as AtlasEntry) : null;
}

/**
 * Load the slot template for an editable atlas. Rejects atlases that are not
 * whitelisted, and atlases that ship no `animations.json` (nothing to template).
 */
export async function loadSlotTemplate(atlasId: string): Promise<SlotTemplate> {
  const entry = await loadFactoryAtlasEntry(atlasId);
  if (!entry) throw new Error(`Unknown atlasId: ${atlasId}`);
  if (entry.editable !== true) throw new Error(`Atlas "${atlasId}" is not editable.`);
  if (!entry.animations) throw new Error(`Atlas "${atlasId}" ships no animations.json.`);

  return buildSlotTemplate(atlasId, await fetchJson<unknown>(entry.animations));
}

// ── Reconciliation ───────────────────────────────────────────────────────────

/** Anything carrying a prefix — the editor's `SpriteData`, or an `AnimationItem`. */
interface HasPrefix {
  prefix: string;
}

export interface SlotReconciliation<T extends HasPrefix> {
  /** Template slots that have a matching entry, in template order. */
  filled: Array<{ slot: SlotDefinition; entry: T }>;
  /** Template slots with nothing to show. The editor marks these as empty. */
  missing: SlotDefinition[];
  /**
   * Entries with no matching slot. Kept, never silently dropped — but the game's
   * config does not reference them, so they will not play.
   */
  extra: T[];
}

/**
 * Line a set of edited entries up against the template. This is the answer to
 * "which animations actually take effect": the template's slots do, and anything
 * in `extra` does not until the game's own config references it.
 */
export function reconcileSlots<T extends HasPrefix>(
  template: SlotTemplate,
  entries: T[],
): SlotReconciliation<T> {
  const byPrefix = new Map<string, T>();
  for (const entry of entries) {
    if (entry && typeof entry.prefix === 'string') byPrefix.set(entry.prefix, entry);
  }

  const filled: Array<{ slot: SlotDefinition; entry: T }> = [];
  const missing: SlotDefinition[] = [];

  for (const slot of template.slots) {
    const entry = byPrefix.get(slot.prefix);
    if (entry) {
      filled.push({ slot, entry });
      byPrefix.delete(slot.prefix);
    } else {
      missing.push(slot);
    }
  }

  return { filled, missing, extra: Array.from(byPrefix.values()) };
}

/** Convenience: the template as plain `AnimationItem`s (the shipped defaults). */
export function templateToAnimations(template: SlotTemplate): AnimationItem[] {
  return template.slots.map((s) => ({ ...s }));
}
