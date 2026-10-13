/**
 * Asset contract — the single definition of what a valid atlas looks like.
 *
 * Both sides of the pipeline import from here: the Pet reads atlases at runtime,
 * the SpriteEditor writes them. Before this module each side carried its own
 * copy of these shapes (four separate declarations of an atlas entry, two of
 * `AnimationItem`), so a format change could not fail at compile time — and the
 * drift was already visible as a duplicated field in the Pet's copy.
 *
 * The naming rules below are the load-bearing part. They were consistently held
 * by hand across every shipped asset; expressing them as functions is what stops
 * that from depending on everyone remembering.
 */

// ── Shapes ───────────────────────────────────────────────────────────────────

/** One entry of `configs/assets.json` (and of a saved customization overlay). */
export interface AtlasEntry {
  atlasId: string;
  /** Path under the app base, or a `data:` URL for a saved customization. */
  png: string;
  json: string;
  animations?: string;
  /**
   * Whitelist flag: may the SpriteEditor open this atlas? Omitted means **no**.
   *
   * Only atlases that are purely named animation sequences qualify. An atlas
   * whose meaning depends on numbers living outside it — a nineslice's corner
   * insets, say — is not editable, because the editor can change the image but
   * not those numbers, so it could only ever change half of it.
   */
  editable?: boolean;
  /**
   * What to call this atlas in the editor's pick list. Pure metadata — never an
   * identifier. The atlasId is what every saved reference points at, so a
   * rename must not be able to reach it (see D8 in docs/SpriteEditor Scope.md).
   * Absent falls back to the atlasId.
   */
  displayName?: string;
  /**
   * One line saying what this atlas changes in the running game, for the
   * editor's pick list. The atlasId names a file; this names the thing the user
   * will see change. Like {@link displayName} it is pure metadata.
   */
  description?: string;
}

/** One entry of an atlas's `animations.json`. */
export interface AnimationItem {
  /** Animation name, and the prefix of its frame names. Must satisfy {@link isValidPrefix}. */
  prefix: string;
  /** Frame count. Frames run `prefix_1` … `prefix_qty`. */
  qty: number;
  /** Frame rate. */
  freq: number;
  repeat: number;
  repeatDelay?: number;
  duration?: number;
}

// ── Naming rules ─────────────────────────────────────────────────────────────

/** `_` separates a frame's prefix from its index, so a prefix may never contain one. */
export const FRAME_SEPARATOR = '_';

/** Frame indices are 1-based (`Phaser.generateFrameNames` is called with `start: 1`). */
export const FIRST_FRAME_INDEX = 1;

const FRAME_NAME = /^(.+)_(\d+)$/;

/** The frame name for a prefix's nth frame (n is 1-based). */
export function frameName(prefix: string, index: number): string {
  return `${prefix}${FRAME_SEPARATOR}${index}`;
}

/** Split a frame name back into prefix + index, or null when it doesn't follow the rule. */
export function parseFrameName(name: string): { prefix: string; index: number } | null {
  const m = FRAME_NAME.exec(name);
  if (!m) return null;
  return { prefix: m[1], index: Number.parseInt(m[2], 10) };
}

/** The key an animation is registered under in Phaser's (global) animation manager. */
export function animationKey(atlasId: string, prefix: string): string {
  return `${atlasId}${FRAME_SEPARATOR}${prefix}`;
}

/**
 * A prefix is an identifier the game's config refers to by name, so it must be
 * free of the frame separator (otherwise `walk_2_1` cannot be split back) and of
 * characters that make it awkward to reference. Compound words use `-`.
 */
export function isValidPrefix(prefix: string): boolean {
  return /^[A-Za-z0-9-]+$/.test(prefix) && !/^\d+$/.test(prefix);
}

/**
 * The atlasId an entry's path implies: the directory under `assets/sprites/`
 * with `/` replaced by `_`. Returns null for a `data:` URL (a customization
 * overlay has no path to derive from).
 */
export function atlasIdFromPath(png: string): string | null {
  if (!png || png.startsWith('data:')) return null;
  const m = /assets\/sprites\/(.+)\/[^/]+$/.exec(png);
  return m ? m[1].replace(/\//g, '_') : null;
}

// ── Validation ───────────────────────────────────────────────────────────────

export interface ContractViolation {
  atlasId: string;
  what: string;
  detail: string;
}

/** Check one atlas entry's id against the path it is loaded from. */
export function validateAtlasEntry(entry: AtlasEntry): ContractViolation[] {
  const out: ContractViolation[] = [];
  const derived = atlasIdFromPath(entry.png);
  if (derived && derived !== entry.atlasId) {
    out.push({
      atlasId: entry.atlasId,
      what: 'atlasId 與路徑不符',
      detail: `路徑推導為 "${derived}"`,
    });
  }
  return out;
}

/** Check an atlas's animations against the prefix rule. */
export function validateAnimations(atlasId: string, animations: AnimationItem[]): ContractViolation[] {
  const out: ContractViolation[] = [];
  for (const a of animations) {
    if (!a || typeof a.prefix !== 'string') continue;
    if (!isValidPrefix(a.prefix)) {
      out.push({
        atlasId,
        what: 'prefix 不合法',
        detail: `"${a.prefix}" — 只允許英數與 '-'，且不可全為數字（'_' 保留給幀編號）`,
      });
    }
  }
  return out;
}

/** Check that every frame name follows `prefix_index`. */
export function validateFrameNames(atlasId: string, frameNames: string[]): ContractViolation[] {
  const out: ContractViolation[] = [];
  for (const name of frameNames) {
    const parsed = parseFrameName(name);
    if (!parsed) {
      out.push({ atlasId, what: '幀名缺少 _編號', detail: `"${name}"` });
    } else if (!isValidPrefix(parsed.prefix)) {
      out.push({ atlasId, what: '幀名的 prefix 不合法', detail: `"${name}"` });
    }
  }
  return out;
}
