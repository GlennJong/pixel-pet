import {
  AnimationSet,
  conditionChangers,
  expectedConditionCells,
  findAction,
  GameConfigFiles,
  lookupPath,
  Section,
  Sentence,
} from '@/game/gameConfig';

/** Stats the basic editor may change. Condition effects are never editable. */
export type EditableStat = 'hp' | 'coin';

/**
 * The game config being edited, and the edits the basic editor can make.
 *
 * Every edit leaves the files whole: changing an action's performance rewrites
 * its condition cells (and, for the actions that define a condition's look,
 * every other action's), so the user sets a thing once and the files still
 * spell everything out. The result is meant to pass `checkGameConfig`.
 *
 * Holds its own copy; `snapshot()` hands one back. Nothing is persisted here.
 */
export class GameConfigProject {
  private files: GameConfigFiles;

  constructor(files: GameConfigFiles) {
    this.files = structuredClone(files);
  }

  snapshot(): GameConfigFiles {
    return structuredClone(this.files);
  }

  /** The atlas the character's animations come from. */
  get characterAtlasId(): string {
    return this.files.character.atlasId;
  }

  // ── Performance ──────────────────────────────────────────────────────────

  animation(action: string): string[] {
    return [...this.require(action).animationSet.default];
  }

  setAnimation(action: string, seq: string[]) {
    const def = this.require(action);
    const before = def.animationSet.default.join(',');
    def.animationSet.default = [...seq];

    // The rules leave condition changers alone, so their cells are carried
    // along by hand: whatever matched the old performance follows the new one.
    if (conditionChangers(this.files).has(action)) {
      for (const [branch, cell] of Object.entries(def.animationSet)) {
        if (cell.join(',') === before) def.animationSet[branch] = [...seq];
      }
    }
    // Sleep, wake and the death look feed every other action's cells, so
    // any edit re-derives all of them rather than guessing which changed.
    this.regenerateConditionCells();
  }

  private regenerateConditionCells() {
    const changers = conditionChangers(this.files);
    const sections: Section[] = ['idleActions', 'actions'];
    for (const section of sections) {
      for (const [name, def] of Object.entries(this.files.character[section])) {
        const cells = expectedConditionCells(this.files, section, name, def.animationSet.default, changers);
        if (cells) def.animationSet = ordered({ ...def.animationSet, ...cells });
      }
    }
  }

  // ── Effects ──────────────────────────────────────────────────────────────

  /** Signed change: +10 adds, -100 takes away. Undefined: no effect on it. */
  effect(action: string, stat: EditableStat): number | undefined {
    const change = this.files.effects.find((e) => e.action === action)?.effect[stat];
    if (!change) return undefined;
    const value = Number(change.value);
    return change.method === 'sub' ? -value : value;
  }

  /**
   * Zero is stored, not removed: a dialogue may print the amount (`{{coin}}`),
   * and a missing effect would leave the placeholder with nothing to fill it.
   */
  setEffect(action: string, stat: EditableStat, delta: number) {
    this.require(action);
    let entry = this.files.effects.find((e) => e.action === action);
    if (!entry) {
      entry = { action, effect: {} };
      this.files.effects.push(entry);
    }
    entry.effect[stat] = delta < 0 ? { method: 'sub', value: -delta } : { method: 'add', value: delta };
  }

  // ── Dialogue ─────────────────────────────────────────────────────────────

  /** The action's first line, which is the one the basic editor edits. */
  dialogue(action: string): { text: string; portrait?: string } | undefined {
    const s = this.firstSentence(action);
    if (!s) return undefined;
    const text = s.scriptId ? lookupPath(this.files.locale, s.scriptId) : s.text;
    return { text: typeof text === 'string' ? text : '', portrait: s.portrait };
  }

  setDialogueText(action: string, text: string) {
    const s = this.firstSentence(action);
    if (!s) throw new Error(`"${action}" has no dialogue`);
    if (s.scriptId) writePath(this.files.locale, s.scriptId, text);
    else s.text = text;
  }

  setPortrait(action: string, portrait: string) {
    const s = this.firstSentence(action);
    if (!s) throw new Error(`"${action}" has no dialogue`);
    s.portrait = portrait;
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private require(action: string) {
    const def = findAction(this.files, action);
    if (!def) throw new Error(`Unknown action "${action}"`);
    return def;
  }

  private firstSentence(action: string): Sentence | undefined {
    return this.require(action).dialogues?.[0]?.sentences[0];
  }
}

/** `default` first, then the conditions — the order the files are written in. */
function ordered(set: AnimationSet): AnimationSet {
  const { default: base, ...rest } = set;
  return { default: base, ...rest };
}

function writePath(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split('.');
  const last = keys.pop()!;
  let node = obj;
  for (const k of keys) {
    if (!node[k] || typeof node[k] !== 'object') node[k] = {};
    node = node[k] as Record<string, unknown>;
  }
  node[last] = value;
}
